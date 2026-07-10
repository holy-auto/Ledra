/**
 * 装着エビデンス写真専用 RFC3161 タイムスタンプ（写真自体の存在時刻封印）。
 *
 * `PARTS_TSA_*`（同じ TS局・同じ env）を再利用するが、`parts/tsa.ts` の
 * `requestTimestamp`（確定署名フロー用）とは呼び出し方を分離する:
 *
 *  - 確定署名は人がその場で待つ低頻度イベントなので TSA 失敗を例外で表面化させ、
 *    リトライを促す（`requestTimestamp` は throw する）。
 *  - エビデンス写真ステージは「撮るだけ」の高頻度カジュアル操作（証明書写真の
 *    アップロードと同じ性質）のため、**TSA 失敗で決して止めない**。失敗時は null を
 *    返し、上位はステージ時点の封印なしとして素直に扱う（サイレントに封印済みを騙らない）。
 *
 * `retryKey` を確定署名と分け、写真ステージのカジュアルな失敗/リトライが確定署名の
 * サーキットブレーカーを巻き込まないようにする（`anchoring/providers/photoTsa.ts` と
 * 同じ分離方針）。
 */

import { fetchTimestamp } from "@/lib/parts/rfc3161";

export interface EvidenceTsaResult {
  /** RFC3161 TimeStampToken（CMS DER）。 */
  token: Buffer;
  authority: string;
  timestampAt: string;
}

/** アップロード経路上で TSA 取得に費やしてよい総時間の上限（fail-open の締切）。 */
const EVIDENCE_TSA_DEADLINE_MS = 5_000;
/** 1 リクエストの per-attempt タイムアウト。 */
const EVIDENCE_TSA_ATTEMPT_MS = 3_000;

/** エビデンス写真 TSA が設定されているか（確定署名と同じ PARTS_TSA_* フラグ）。 */
export function isEvidenceTsaEnabled(): boolean {
  return (process.env.PARTS_TSA_ENABLED ?? "").toLowerCase() === "true" && !!process.env.PARTS_TSA_URL;
}

/**
 * 与えられたハッシュ(hex)に対してタイムスタンプトークンを取得する。
 * 未設定/失敗/締切超過はいずれも null（アップロードを止めない fail-open）。
 */
export async function requestEvidenceTimestamp(hashHex: string): Promise<EvidenceTsaResult | null> {
  if (!isEvidenceTsaEnabled()) return null;

  try {
    const url = process.env.PARTS_TSA_URL!;
    // URL 解析も try 内に置く（不正 URL でも 500 にせず null へ degrade）。
    const authority = process.env.PARTS_TSA_AUTHORITY || new URL(url).host;

    const fetchP = fetchTimestamp(url, hashHex, {
      username: process.env.PARTS_TSA_USERNAME,
      password: process.env.PARTS_TSA_PASSWORD,
      timeoutMs: EVIDENCE_TSA_ATTEMPT_MS,
      // 確定署名 (parts/tsa.ts の requestTimestamp) とは別の circuit breaker key。
      retryKey: "parts-evidence-tsa",
    });
    const deadlineP = new Promise<null>((resolve) => setTimeout(() => resolve(null), EVIDENCE_TSA_DEADLINE_MS));
    const result = await Promise.race([fetchP, deadlineP]);
    if (!result) return null; // 締切超過 → 封印なしで続行
    return { token: result.token, authority, timestampAt: result.genTime };
  } catch (err) {
    console.warn(
      "[parts-evidence-tsa] timestamp request failed, degrading to no-seal",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
