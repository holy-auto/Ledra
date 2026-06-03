/**
 * 確定署名の本人性照合に使う「電話フル番号ハッシュ」。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.4
 *
 * 下4桁ハッシュ（既存 phone_last4_hash）は衝突空間 10⁴ で弱いため、確定の照合主キーは
 * フル番号(E.164)ハッシュにする。生番号は保存・送信せずハッシュのみを比較する。
 * レシピは既存 customerPortalServer と同じ pepper(CUSTOMER_AUTH_PEPPER) を用いる。
 */

import { sha256Hex } from "@/lib/customerPortalServer";

/**
 * 日本の電話番号を素朴に E.164 正規化する。
 * - 数字以外を除去
 * - 先頭 0 を +81 に置換（日本前提）
 * - 既に 81 始まりなら + を付与
 * 厳密な検証はしない（保存せずハッシュ化するだけなので、決定的に正規化できれば十分）。
 */
export function normalizeE164JP(raw: string): string {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (!digits) throw new Error("normalizeE164JP: empty phone");
  if (digits.startsWith("0")) return `+81${digits.slice(1)}`;
  if (digits.startsWith("81")) return `+${digits}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+81${digits}`;
}

/** sha256(v1|tenantId|E164|PEPPER)。phone_last4_hash と同じ pepper を使う。 */
export function phoneFullHash(tenantId: string, e164: string): string {
  const pepper = process.env.CUSTOMER_AUTH_PEPPER;
  if (!pepper) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  if (!e164) throw new Error("phoneFullHash: empty e164");
  return sha256Hex(`fullphone|v1|${tenantId}|${e164}|${pepper}`);
}

/** 生の電話番号（任意フォーマット）から直接フルハッシュを得る便宜関数。 */
export function phoneFullHashFromRaw(tenantId: string, rawPhone: string): string {
  return phoneFullHash(tenantId, normalizeE164JP(rawPhone));
}
