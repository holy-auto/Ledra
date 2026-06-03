/**
 * RFC3161 タイムスタンプ（国内 JIPDEC 認定TS局）の連携。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.3b / §10-11
 *
 * 「その時刻にその内容が存在し、以後改変されていない」ことを第三者(TS局)が証明する。
 * Polygon アンカーと同様 env で有効化し、未設定環境では no-op（null を返す＝確定は止めない）。
 *
 * 実プロバイダ（セイコー/アマノ/セコム等）の RFC3161 HTTP エンドポイントは
 * PARTS_TSA_URL / PARTS_TSA_AUTHORITY で設定する。必要なら Basic 認証を
 * PARTS_TSA_USERNAME / PARTS_TSA_PASSWORD で付与する。
 */

import { fetchTimestamp } from "@/lib/parts/rfc3161";

export interface TsaResult {
  /** RFC3161 TimeStampToken（CMS DER）。保存は bytea。 */
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
 * 未設定環境では null（no-op）。設定済みなら RFC3161 TSA に問い合わせ、
 * 失敗時は例外を投げる（黙って無署名にしない）。
 */
export async function requestTimestamp(hashHex: string): Promise<TsaResult | null> {
  if (!isTsaEnabled()) return null;

  const url = process.env.PARTS_TSA_URL!;
  const authority = process.env.PARTS_TSA_AUTHORITY ?? new URL(url).host;
  const { token, genTime } = await fetchTimestamp(url, hashHex, {
    username: process.env.PARTS_TSA_USERNAME,
    password: process.env.PARTS_TSA_PASSWORD,
  });
  return { token, authority, timestampAt: genTime };
}
