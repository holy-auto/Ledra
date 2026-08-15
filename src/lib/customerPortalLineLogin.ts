/**
 * LINE 連携済み顧客向けの「email 不要」マイページログイン。
 *
 * マイページの既定ログインは email + 電話下4桁の OTP で、email を持たない顧客は
 * URL を開いても入れない。LINE 連携済みなら本人性は既に取れているので、連携時
 * (および顧客が「マイページ」と送ったとき) に単回使用・期限付きのトークンを発行し、
 * その URL からポータルセッションを張る。
 *
 * 安全側の作り:
 *   - 生トークンは保存しない (sha256 + CUSTOMER_AUTH_PEPPER のみ保存)
 *   - 単回使用 (used_at IS NULL 条件付き UPDATE でクレーム。並行タップでも1回)
 *   - 期限付き (既定 7 日)。切れても LINE で「マイページ」と送れば再発行できる
 *   - URL の配送先は連携済み LINE ユーザーの 1:1 トークのみ (呼び出し側で担保)
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { randomHex, sha256Hex } from "@/lib/customerPortalServer";

/**
 * トークンの有効期限 (分)。既定 7 日。
 *
 * LINE のトークに残ったリンクを後日タップされる前提なので OTP より長い。単回使用 +
 * 「マイページ」再発行があるため、長さの割にリスクは限定される。
 */
const TTL_MIN = Number(process.env.PORTAL_LINE_LOGIN_TTL_MIN) || 60 * 24 * 7;

function admin() {
  return createServiceRoleAdmin("顧客ポータル LINE ログイン — トークン発行/消費 (顧客セッション前で auth 無し)");
}

function tokenHash(token: string): string {
  const pepper = process.env.CUSTOMER_AUTH_PEPPER;
  if (!pepper) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return sha256Hex(`portallogin|v1|${token}|${pepper}`);
}

/**
 * 顧客向けのログイントークンを発行する。返り値の token を URL に載せる。
 *
 * 発行のたびに新しい行を作る (古い行は期限切れで自然に死ぬ)。同じ顧客に複数の
 * 有効トークンが並ぶが、どれも単回使用なので実害は無い。
 */
export async function issuePortalLoginToken(tenantId: string, customerId: string): Promise<string> {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000).toISOString();

  const { error } = await admin()
    .from("customer_portal_login_tokens")
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      token_hash: tokenHash(token),
      expires_at: expiresAt,
    });
  if (error) throw new Error(`issuePortalLoginToken failed: ${error.message}`);

  return token;
}

/**
 * トークンを消費し、紐づく (tenantId, customerId) を返す。
 * 無効・期限切れ・使用済みなら null。
 *
 * tenant は**トークン側の値を正**とする。URL の tenant パラメータを信じると、
 * 別テナントを指定して他店舗のスコープでセッションを張られ得るため。
 */
export async function consumePortalLoginToken(token: string): Promise<{ tenantId: string; customerId: string } | null> {
  const normalized = (token ?? "").trim();
  // randomHex(32) = 64 桁の hex。形が違うものは DB を引く前に落とす。
  if (!/^[0-9a-f]{64}$/.test(normalized)) return null;

  const db = admin();
  const { data: row } = await db
    .from("customer_portal_login_tokens")
    .select("id, tenant_id, customer_id, expires_at, used_at")
    .eq("token_hash", tokenHash(normalized))
    .maybeSingle();

  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null;

  // 単回使用に固定 (並行タップでの二重使用を防ぐ条件付き UPDATE)。
  const { data: claimed } = await db
    .from("customer_portal_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return null;

  return { tenantId: String(row.tenant_id), customerId: String(row.customer_id) };
}

/**
 * 消費済みトークンを未使用に戻す。
 *
 * 消費に成功した後・セッションを張る前に落ちたときだけ呼ぶ。こちら側の障害で顧客の
 * リンクを永久に焼いてしまうと、email 無しの顧客はマイページに入る手段を完全に失う。
 * 期限そのものは戻さない (expires_at はそのまま) ので、窓が延びることはない。
 */
export async function releasePortalLoginToken(token: string): Promise<void> {
  const normalized = (token ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(normalized)) return;

  await admin().from("customer_portal_login_tokens").update({ used_at: null }).eq("token_hash", tokenHash(normalized));
}
