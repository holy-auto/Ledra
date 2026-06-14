/**
 * 供給パートナー (メーカー) の LINE 連携コード。
 *
 * メーカーが受注ポータルで短いコードを発行し、Ledra 公式 LINE 公式アカウントへ送信すると
 * プラットフォーム webhook が照合して supply_partners.line_user_id をセットする
 * (src/lib/line/linkCode.ts の供給パートナー版)。
 *
 * - 生コードは保存せず sha256(pepper) のみ・短期限・単回使用。
 * - ハッシュは partnerId を含めない: webhook はコードだけを受け取り、照合した行から
 *   partner_id を引く (顧客版は channel から tenantId が分かるが、共通チャネルでは不明なため)。
 */
import crypto from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/customerPortalServer";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字を除外
const CODE_LEN = 6;
const DEFAULT_TTL_MIN = Number(process.env.SUPPLY_LINE_LINK_TTL_MIN ?? 30);

export function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}

export function normalizeLinkCode(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function codeHash(normalizedCode: string): string {
  const pepper = process.env.CUSTOMER_AUTH_PEPPER;
  if (!pepper) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return sha256Hex(`supply-linecode|v1|${normalizedCode}|${pepper}`);
}

/** パートナー本人向けに連携コードを発行する。返り値の code を画面に提示する。 */
export async function generateSupplyPartnerLinkCode(
  supplyPartnerId: string,
): Promise<{ code: string; expiresAt: string }> {
  const admin = createServiceRoleAdmin("supply LINE 連携コード発行 (メーカー × LINE userId の紐付け)");
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MIN * 60_000).toISOString();
  const { error } = await admin.from("supply_partner_line_link_codes").insert({
    supply_partner_id: supplyPartnerId,
    code_hash: codeHash(code),
    expires_at: expiresAt,
  });
  if (error) throw new Error(`supply link code insert failed: ${error.message}`);
  return { code, expiresAt };
}

/**
 * LINE inbound テキストが有効な連携コードなら supply_partners.line_user_id を紐付ける。
 * 共通チャネル webhook から呼ぶ。単回使用 (used_at 条件付き update) で二重消費を防ぐ。
 */
export async function tryConsumeSupplyPartnerLineLinkCode(
  lineUserId: string,
  text: string,
): Promise<{ linked: boolean }> {
  const normalized = normalizeLinkCode(text);
  if (normalized.length !== CODE_LEN) return { linked: false };

  const admin = createServiceRoleAdmin("supply LINE 連携コード消費 (webhook で照合・紐付け)");
  const { data: row } = await admin
    .from("supply_partner_line_link_codes")
    .select("id, supply_partner_id, expires_at, used_at")
    .eq("code_hash", codeHash(normalized))
    .is("used_at", null)
    .maybeSingle();
  if (!row) return { linked: false };
  if (new Date(row.expires_at as string) < new Date()) return { linked: false };

  const { data: claimed } = await admin
    .from("supply_partner_line_link_codes")
    .update({ used_at: new Date().toISOString(), used_line_user_id: lineUserId })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { linked: false };

  const { error: linkErr } = await admin
    .from("supply_partners")
    .update({ line_user_id: lineUserId })
    .eq("id", row.supply_partner_id as string);
  if (linkErr) throw new Error(`supply partner line link failed: ${linkErr.message}`);

  return { linked: true };
}
