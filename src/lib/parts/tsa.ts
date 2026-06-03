/**
 * RFC3161 タイムスタンプ（国内 JIPDEC 認定TS局）の抽象。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.3b / §10-11
 *
 * 「その時刻にその内容が存在し、以後改変されていない」ことを第三者(TS局)が証明する。
 * Polygon アンカーと同様 env で有効化し、未設定環境では no-op（null を返す＝確定は止めない）。
 *
 * 実プロバイダ（セイコー/アマノ/セコム等）の RFC3161 HTTP エンドポイントは
 * PARTS_TSA_URL / PARTS_TSA_AUTHORITY で設定する。本体の DER TimeStampReq/Resp の
 * 生成・解析は導入時にベンダ SDK で差し替える（ここでは骨組みと no-op を提供）。
 */

export interface TsaResult {
  /** RFC3161 TimeStampToken（DER）。保存は bytea。 */
  token: Buffer;
  authority: string;
  timestampAt: string;
}

/** TSA が設定されているか。 */
export function isTsaEnabled(): boolean {
  return (process.env.PARTS_TSA_ENABLED ?? "").toLowerCase() === "true" && !!process.env.PARTS_TSA_URL;
}

/**
 * 与えられたハッシュ(hex)に対してタイムスタンプトークンを取得する。
 * 未設定環境では null（no-op）。
 *
 * NOTE: 実 TSA 連携は導入時に実装する。現状は env で無効化されている前提で null を返し、
 * 設定済みなのに未実装の場合は明示的にエラーにして「黙って無署名」を防ぐ。
 */
export async function requestTimestamp(hashHex: string): Promise<TsaResult | null> {
  if (!isTsaEnabled()) return null;
  throw new Error(
    `[tsa] PARTS_TSA_ENABLED ですが RFC3161 連携が未実装です（hash=${hashHex.slice(0, 8)}…）。` +
      "導入時にベンダ SDK で実装してください。",
  );
}
