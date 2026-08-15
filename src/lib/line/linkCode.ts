/**
 * 顧客LINE連携コード（友だち追加→linkage 導線）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.2
 *
 * 店が顧客ごとに短いコードを発行し、顧客が LINE 公式アカウントにそのコードを送信すると
 * webhook が照合して customers.line_user_id をセットする。LIFF/OAuth 不要の低摩擦方式。
 * 生コードは保存せず sha256(pepper) のみ保存・短期限・単回使用。
 */

import crypto from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/customerPortalServer";

// 紛らわしい文字(0/O/1/I)を除いた英数字。
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;
const DEFAULT_TTL_MIN = Number(process.env.PARTS_LINE_LINK_TTL_MIN ?? 30);

/** 連携コードを生成する（純粋・暗号乱数）。 */
export function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}

/** 入力テキストを連携コードとして正規化（大文字化・英数字以外除去）。 */
export function normalizeLinkCode(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function codeHash(tenantId: string, normalizedCode: string): string {
  const pepper = process.env.CUSTOMER_AUTH_PEPPER;
  if (!pepper) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return sha256Hex(`linecode|v1|${tenantId}|${normalizedCode}|${pepper}`);
}

/** 顧客向けに連携コードを発行する。返り値の code を顧客へ提示する。 */
export async function generateCustomerLinkCode(
  tenantId: string,
  customerId: string,
  createdBy: string | null,
): Promise<{ code: string; expiresAt: string }> {
  const admin = createServiceRoleAdmin("parts LINE 連携コード発行（顧客×LINE userId の紐付け）");
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MIN * 60_000).toISOString();

  const { error } = await admin.from("customer_line_link_codes").insert({
    tenant_id: tenantId,
    customer_id: customerId,
    code_hash: codeHash(tenantId, code),
    expires_at: expiresAt,
    created_by: createdBy,
  });
  if (error) throw new Error(`link code insert failed: ${error.message}`);
  return { code, expiresAt };
}

/**
 * LINE inbound テキストが有効な連携コードなら customers.line_user_id を紐付ける。
 * webhook(handleWebhookEvents) から呼ぶ。
 * @returns linked=true なら連携成功。portalText は連携完了リプライへ同梱するマイページ案内
 *   (組み立てられなければ null)。プッシュではなく無料の応答メッセージで送るため、
 *   送信自体は呼び出し側 (webhook) が行う。
 */
export async function tryConsumeLineLinkCode(
  tenantId: string,
  lineUserId: string,
  text: string,
  /**
   * マイページ案内 (ログイントークン入り) を組み立てるか。グループ/ルームからの
   * 連携ではリプライに載せられないので、無駄なトークンを発行しないよう false を渡す。
   */
  withPortalLink = true,
): Promise<{ linked: boolean; portalText?: string | null }> {
  const normalized = normalizeLinkCode(text);
  if (normalized.length !== CODE_LEN) return { linked: false };

  const admin = createServiceRoleAdmin("parts LINE 連携コード消費（webhook で照合・紐付け）");
  const { data: row } = await admin
    .from("customer_line_link_codes")
    .select("id, customer_id, expires_at, used_at")
    .eq("tenant_id", tenantId)
    .eq("code_hash", codeHash(tenantId, normalized))
    .is("used_at", null)
    .maybeSingle();

  if (!row) return { linked: false };
  if (new Date(row.expires_at) < new Date()) return { linked: false };

  // 単回使用に固定（並行送信での二重使用を防ぐため used_at 条件付き update）
  const { data: claimed } = await admin
    .from("customer_line_link_codes")
    .update({ used_at: new Date().toISOString(), used_line_user_id: lineUserId })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { linked: false };

  // 紐づけ + 過去メッセージの backfill + 履歴一括取り込みの enqueue をまとめて行う。
  // (受信箱からの手動紐づけと挙動を揃える)
  const { linkLineUserToCustomer, buildPortalWelcomeText } = await import("@/lib/line/linkCustomer");
  const linked = await linkLineUserToCustomer({
    tenantId,
    customerId: row.customer_id as string,
    lineUserId,
    // 直後に連携完了リプライ (無料) を返す経路なので、有料のプッシュ送信は抑止して同梱する。
    suppressPortalMessage: true,
  });
  if (!linked.ok) throw new Error("customer line link failed");

  const portalText = withPortalLink
    ? await buildPortalWelcomeText(tenantId, row.customer_id as string).catch(() => null)
    : null;
  return { linked: true, portalText };
}
