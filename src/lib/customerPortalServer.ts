import crypto from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { OUTWARD_VISIBLE_TYPES } from "@/lib/audit/certificateLog";
import { escapeIlike } from "@/lib/sanitize";

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER!;

export const CUSTOMER_COOKIE = "hc_cs";
/**
 * OTP lifetime in minutes. Shortened from 10 → 5 to reduce the window an
 * attacker has to use a leaked code (e.g. via shared inbox, email forwarding
 * misconfiguration). Resend latency is well under 30s in practice so 5 min
 * remains user-friendly.
 */
export const OTP_TTL_MIN = 5;
/**
 * Max OTP guesses before the row is locked. Tightened from 5 → 3 to defend
 * against a 6-digit code attacker who has email access but is rate-limited
 * elsewhere. With 3 attempts the brute-force success probability is 3/10^6.
 */
export const OTP_MAX_ATTEMPTS = 3;
export const SESSION_TTL_DAYS = 30;

function assertEnv() {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  // createServiceRoleAdmin() will throw if Supabase credentials are missing
}

export function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function randomHex(bytes: number) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeLast4(last4: string) {
  const s = last4.trim();
  if (!/^\d{4}$/.test(s)) throw new Error("phone_last4 must be 4 digits");
  return s;
}

/**
 * 顧客台帳の電話番号から下4桁を取り出す。全角数字は半角に揃えてから数字だけを残す
 * （店の入力フォームは数字を正規化しない）。4桁に満たなければ null。
 * ponytail: 「03-1234-5678 内線12」のような内線付きは末尾の内線を拾う。台帳の入力ルールで防ぐ。
 */
export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "")
    .normalize("NFKC")
    .replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

// 重要：certificates.customer_phone_last4_hash と同じ方法で作る
export function phoneLast4Hash(tenantId: string, last4: string) {
  assertEnv();
  const v = normalizeLast4(last4);
  return sha256Hex(`v1|${tenantId}|${v}|${PEPPER}`);
}

export function otpCodeHash(tenantId: string, email: string, phoneHash: string, code: string) {
  assertEnv();
  return sha256Hex(`otp|v1|${tenantId}|${normalizeEmail(email)}|${phoneHash}|${code}|${PEPPER}`);
}

export function sessionHash(token: string) {
  assertEnv();
  return sha256Hex(`sess|v1|${token}|${PEPPER}`);
}

/** Get the shared admin Supabase client (singleton) — used for customer portal lookups that span tenant boundaries (slug → tenant_id) and inner queries that already pass tenant_id explicitly. */
function admin() {
  assertEnv();
  return createServiceRoleAdmin(
    "customer portal server — tenant slug lookup + helpers that thread tenant_id explicitly",
  );
}

export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  const { data } = await admin().from("tenants").select("id").eq("slug", slug).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function createLoginCode(
  tenantId: string,
  email: string,
  phoneHash: string,
  code: string,
  expiresAtIso: string,
) {
  const code_hash = otpCodeHash(tenantId, email, phoneHash, code);
  const { error } = await admin()
    .from("customer_login_codes")
    .insert({
      tenant_id: tenantId,
      email: normalizeEmail(email),
      phone_last4_hash: phoneHash,
      code_hash,
      expires_at: expiresAtIso,
    });
  if (error) throw new Error(`createLoginCode failed: ${error.message}`);
}

export async function getLatestValidCodeRow(tenantId: string, email: string, phoneHash: string) {
  const { data } = await admin()
    .from("customer_login_codes")
    .select("id, code_hash, expires_at, used_at, attempts")
    .eq("tenant_id", tenantId)
    .eq("email", normalizeEmail(email))
    .eq("phone_last4_hash", phoneHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * 試行を1回分予約する（照合の前に呼ぶ）。読んだ回数 `prevAttempts` のままで未使用の行だけを +1 する。
 * 同時に来たリクエストは同じ回数を読むが、更新できるのは1つだけなので、上限を超えて照合されない。
 * false なら予約できなかった（別の試行に負けた・使用済み）。照合せずに失敗として返す。
 */
export async function markCodeAttempt(id: string, prevAttempts: number): Promise<boolean> {
  const { data, error } = await admin()
    .from("customer_login_codes")
    .update({ attempts: prevAttempts + 1 })
    .eq("id", id)
    .eq("attempts", prevAttempts)
    .is("used_at", null)
    .select("id");
  if (error) throw new Error(`markCodeAttempt failed: ${error.message}`);
  return (data ?? []).length === 1;
}

export async function markCodeUsed(id: string) {
  const { error } = await admin()
    .from("customer_login_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`markCodeUsed failed: ${error.message}`);
}

/**
 * (tenant, 電話下4桁ハッシュ, メール) から顧客を1人に確定する。確定できなければ null。
 *
 * **顧客ポータルの本人確認はここだけで行う。** null のときはコードを送らず
 * (request-code)、セッションも作らない (createSession)。以前は null でもセッションを
 * 作り、データ取得が「下4桁ハッシュだけで絞る」旧経路に落ちていたため、
 * 自分のメールと下4桁 (10⁴ 通り) を入れるだけで、その下4桁の他人の証明書・
 * 氏名・メール・電話 (全桁)・問い合わせが読めた (監査 2026-10-17 Critical)。
 *
 * 下4桁は衝突するので「下4桁の一致する顧客が1人」は求めない。登録メールの一致する顧客を
 * 先に引き、その中で**顧客台帳の電話の下4桁**が一致する者がちょうど1人のときに確定する。
 * 証明書の下4桁ハッシュ（写し）は見ない。作成経路の一部でしか入らず本番では1件も無かったうえ、
 * 台帳の電話を直しても古い下4桁で入れてしまうため（2026-10-17）。
 * 2人以上なら確定しない（fail-closed）。同じメールを家族で共有し下4桁も同じなら、
 * 2人のログイン要素は完全に同じで区別できない —— 片方を選ぶと、もう片方のデータを渡す。
 * 同じ人の重複登録もここで締め出されるが、それは店側で顧客を統合して解く（LINE ログインは使える）。
 * メール未登録の顧客はここでは確定できない (LINE ログインの経路は別にある)。
 */
export async function resolveUniqueCustomerId(
  tenantId: string,
  phoneHash: string,
  email: string,
): Promise<string | null> {
  const db = admin();
  const { data: customers, error } = await db
    .from("customers")
    .select("id, phone")
    .eq("tenant_id", tenantId)
    .ilike("email", escapeIlike(normalizeEmail(email)));
  if (error || !customers) return null;

  const matched = customers.filter((c) => {
    const l4 = phoneLast4(c.phone as string | null);
    return l4 !== null && phoneLast4Hash(tenantId, l4) === phoneHash;
  });
  return matched.length === 1 ? (matched[0].id as string) : null;
}

export async function createSession(tenantId: string, email: string, phoneHash: string) {
  const token = randomHex(32);
  const sHash = sessionHash(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 顧客を確定できないセッションは作らない（resolveUniqueCustomerId のコメント参照）。
  const customerId = await resolveUniqueCustomerId(tenantId, phoneHash, email);
  if (!customerId) return null;

  // phone_last4 (平文) はセッションに保存しない。証明書検索はハッシュ一本化済み。
  const { error } = await admin()
    .from("customer_sessions")
    .insert({
      tenant_id: tenantId,
      email: normalizeEmail(email),
      phone_last4_hash: phoneHash,
      session_hash: sHash,
      customer_id: customerId,
      expires_at: expires,
    });
  if (error) throw new Error(`createSession failed: ${error.message}`);

  return { token, expiresAtIso: expires };
}

/**
 * customer_id だけに紐づくセッションを作る (LINE ログイン用)。
 *
 * email / 電話下4桁を伴わないため、データ取得は必ず customer_id スコープの経路を通る
 * (`listCertificatesForCustomer` 等の Phase 2 パス)。email 無しの顧客でもマイページに
 * 入れるようにするための入口で、本人性は呼び出し側 (LINE 連携済み + 単回使用トークン)
 * が担保する。
 */
export async function createSessionForCustomer(tenantId: string, customerId: string) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin()
    .from("customer_sessions")
    .insert({
      tenant_id: tenantId,
      email: null,
      phone_last4_hash: null,
      session_hash: sessionHash(token),
      customer_id: customerId,
      expires_at: expires,
    });
  if (error) throw new Error(`createSessionForCustomer failed: ${error.message}`);

  return { token, expiresAtIso: expires };
}

export async function revokeSessionByToken(token: string) {
  const sHash = sessionHash(token);
  const { error } = await admin()
    .from("customer_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_hash", sHash);
  if (error) throw new Error(`revokeSessionByToken failed: ${error.message}`);
}

export async function validateSession(tenantId: string, token: string) {
  const sHash = sessionHash(token);
  const { data } = await admin()
    .from("customer_sessions")
    .select("id, email, phone_last4_hash, customer_id, expires_at, revoked_at")
    .eq("tenant_id", tenantId)
    .eq("session_hash", sHash)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  // customer_id の無いセッションは、顧客を確定せずに作られていた旧セッション。
  // 下4桁ハッシュだけで他人のデータに届くので受け付けない（再ログインで customer_id 付きになる）。
  if (!data.customer_id) return null;
  // email / phone_last4_hash は LINE ログインのセッションでは null。
  return data as {
    email: string | null;
    phone_last4_hash: string | null;
    customer_id: string;
  };
}

/**
 * 顧客の証明書一覧。範囲は customer_id だけで決める。
 * 電話下4桁ハッシュで絞る旧経路は、下4桁が同じ他人の証明書を返すため廃止した
 * （resolveUniqueCustomerId のコメント参照）。
 */
export async function listCertificatesForCustomer(tenantId: string, customerId: string) {
  const { data } = await admin()
    .from("certificates")
    .select("public_id, customer_name, vehicle_info_json, created_at, status")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .neq("status", "void")
    // 所有権移転が受諾された車両の証明書は旧オーナーに出さない（acceptTransferByToken が印を付ける）。
    // 履歴・件数・加盟店一覧はすべてこの関数を通る。
    .is("hidden_from_owner_portal_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** 顧客の施工履歴（vehicle_histories）を取得 */
export async function listHistoryForCustomer(tenantId: string, customerId: string) {
  const certs = await listCertificatesForCustomer(tenantId, customerId);
  if (!certs || certs.length === 0) return [];

  const certPublicIds = certs.map((c: { public_id: string }) => c.public_id);
  const db = admin();

  // certificate_id ベースで検索するために certificates の id が必要
  const { data: certRows } = await db
    .from("certificates")
    .select("id, public_id")
    .eq("tenant_id", tenantId)
    .in("public_id", certPublicIds);
  if (!certRows || certRows.length === 0) return [];

  const certIds = certRows.map((c: { id: string }) => c.id);
  const { data: histories } = await db
    .from("vehicle_histories")
    .select("id, type, title, description, performed_at, certificate_id")
    .eq("tenant_id", tenantId)
    .in("certificate_id", certIds)
    // **閲覧監査の行を顧客に見せない。** ここは service-role（RLS を通らない）で引き、
    // 呼び出し側の `/api/customer/list` は画面で `description` をそのまま描画し、
    // `/api/customer/data-export` は書き出しに入れる。型で絞らないと、自分の証明書の
    // 履歴として**他の訪問者の IP** と**店舗スタッフの uid** が顧客に見える。
    //
    // PR #1040 は同じ漏れを公開ページ側だけ直していて、こちらが残っていた
    // （書く側の `logCertificateAction` は1つ、読む側が2つある形）。
    .in("type", OUTWARD_VISIBLE_TYPES)
    .order("performed_at", { ascending: false })
    .limit(50);
  return histories ?? [];
}

/** 顧客の今後の予約を取得 */
export async function listReservationsForCustomer(tenantId: string, customerId: string) {
  const db = admin();

  const today = new Date().toISOString().slice(0, 10);
  const { data: reservations } = await db
    .from("reservations")
    .select("id, scheduled_date, start_time, title, menu_items_json, status, note")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .gte("scheduled_date", today)
    .neq("status", "cancelled")
    .order("scheduled_date", { ascending: true })
    .limit(10);
  // フロントエンドの型 (date, time_slot, menu) に合わせてフィールドをマッピング
  return (reservations ?? []).map((r) => ({
    id: r.id,
    date: r.scheduled_date,
    time_slot: r.start_time ?? null,
    menu: r.title ?? null,
    status: r.status,
    note: r.note ?? null,
  }));
}

/** 顧客プロフィール情報を取得 */
export async function getCustomerProfile(tenantId: string, customerId: string) {
  const db = admin();
  const { data: customer } = await db
    .from("customers")
    .select("id, name, email, phone")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .limit(1)
    .maybeSingle();

  const { count: certificateCount } = await db
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .neq("status", "void")
    .is("hidden_from_owner_portal_at", null);

  if (!customer) return null;
  return {
    name: customer.name,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    certificateCount: certificateCount ?? 0,
  };
}
