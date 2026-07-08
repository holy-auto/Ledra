/**
 * 写真専用 RFC3161 タイムスタンプ（撮影時来歴の「存在時刻」封印）。
 *
 * 汎用の {@link fetchTimestamp}（`src/lib/parts/rfc3161.ts`）を薄くラップする。
 * 部品側 `parts/tsa.ts` (`PARTS_TSA_*` gated) は流用せず、写真専用 env で分離する
 * （TS局・課金・レート制御を用途別に切り分けられるように）。
 *
 * 設計上の違い: 部品確定署名は人がその場で待つイベントなので TSA 失敗を例外で
 * 表面化させるが、写真アップロードは大量・非同期のため **TSA 失敗で決して止めない**。
 * 失敗時は null を返し、上位は封印なし = `captureTimeSealOk=false` として素直に
 * basic へ degrade する（サイレントに担保を騙らない）。
 *
 * Env: PHOTO_TSA_ENABLED / PHOTO_TSA_URL / PHOTO_TSA_AUTHORITY /
 *      PHOTO_TSA_USERNAME / PHOTO_TSA_PASSWORD
 */

import { fetchTimestamp } from "@/lib/parts/rfc3161";

export interface PhotoTsaResult {
  /** RFC3161 TimeStampToken（CMS DER）。保存は bytea。 */
  token: Buffer;
  authority: string;
  timestampAt: string;
}

/** アップロード経路上で TSA 取得に費やしてよい総時間の上限（fail-open の締切）。 */
const PHOTO_TSA_DEADLINE_MS = 5_000;
/** 1 リクエストの per-attempt タイムアウト（写真は大量なので短め）。 */
const PHOTO_TSA_ATTEMPT_MS = 3_000;

/** 写真 TSA が設定されているか。 */
export function isPhotoTsaEnabled(): boolean {
  return (process.env.PHOTO_TSA_ENABLED ?? "").toLowerCase() === "true" && !!process.env.PHOTO_TSA_URL;
}

/**
 * 与えられたハッシュ(hex)に対してタイムスタンプトークンを取得する。
 * 未設定/失敗/締切超過はいずれも null（アップロードを止めない fail-open）。
 *
 * この await は provider fan-out より前に走るため、TSA が遅い/不達でも upload の
 * `maxDuration` を食い潰さないよう、リトライ込みの総時間を締切でハードキャップする。
 */
export async function requestPhotoTimestamp(hashHex: string): Promise<PhotoTsaResult | null> {
  if (!isPhotoTsaEnabled()) return null;

  try {
    const url = process.env.PHOTO_TSA_URL!;
    // URL 解析も含めて try 内に置く（不正 URL でも 500 にせず null へ degrade）。
    const authority = process.env.PHOTO_TSA_AUTHORITY || new URL(url).host;

    const fetchP = fetchTimestamp(url, hashHex, {
      username: process.env.PHOTO_TSA_USERNAME,
      password: process.env.PHOTO_TSA_PASSWORD,
      timeoutMs: PHOTO_TSA_ATTEMPT_MS,
      // parts 確定署名とは別の circuit breaker key（相互に開かないよう分離）。
      retryKey: "photo-tsa",
    });
    // リトライ/バックオフ込みの総時間を締切でキャップ。
    const deadlineP = new Promise<null>((resolve) => setTimeout(() => resolve(null), PHOTO_TSA_DEADLINE_MS));
    const result = await Promise.race([fetchP, deadlineP]);
    if (!result) return null; // 締切超過 → 封印なしで続行
    return { token: result.token, authority, timestampAt: result.genTime };
  } catch (err) {
    console.warn(
      "[photo-tsa] timestamp request failed, degrading to no-seal",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
