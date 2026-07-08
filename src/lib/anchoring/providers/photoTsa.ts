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

/** 写真 TSA が設定されているか。 */
export function isPhotoTsaEnabled(): boolean {
  return (process.env.PHOTO_TSA_ENABLED ?? "").toLowerCase() === "true" && !!process.env.PHOTO_TSA_URL;
}

/**
 * 与えられたハッシュ(hex)に対してタイムスタンプトークンを取得する。
 * 未設定/失敗時はいずれも null（アップロードを止めない fail-open）。
 */
export async function requestPhotoTimestamp(hashHex: string): Promise<PhotoTsaResult | null> {
  if (!isPhotoTsaEnabled()) return null;

  const url = process.env.PHOTO_TSA_URL!;
  const authority = process.env.PHOTO_TSA_AUTHORITY ?? new URL(url).host;
  try {
    const { token, genTime } = await fetchTimestamp(url, hashHex, {
      username: process.env.PHOTO_TSA_USERNAME,
      password: process.env.PHOTO_TSA_PASSWORD,
    });
    return { token, authority, timestampAt: genTime };
  } catch (err) {
    console.warn(
      "[photo-tsa] timestamp request failed, degrading to no-seal",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
