import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER!;

export const CUSTOMER_COOKIE = "hc_cs";
export const OTP_TTL_MIN = 10;
export const SESSION_TTL_DAYS = 30;

function assertEnv() {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  // getSupabaseAdmin() will throw if Supabase credentials are missing
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

/** Get the shared admin Supabase client (singleton) */
function admin() {
  assertEnv();
  return getSupabaseAdmin();
}

export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  const { data } = await admin()
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function tenantHasPhoneHash(tenantId: string, phoneHash: string): Promise<boolean> {
  const { data } = await admin()
    .from("certificates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_phone_last4_hash", phoneHash)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function createLoginCode(tenantId: string, email: string, phoneHash: string, code: string, expiresAtIso: string) {
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

export async function markCodeAttempt(id: string, attempts: number) {
  const { error } = await admin()
    .from("customer_login_codes")
    .update({ attempts })
    .eq("id", id);
  if (error) throw new Error(`markCodeAttempt failed: ${error.message}`);
}

export async function markCodeUsed(id: string) {
  const { error } = await admin()
    .from("customer_login_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`markCodeUsed failed: ${error.message}`);
}

export async function createSession(tenantId: string, email: string, phoneHash: string) {
  const token = randomHex(32);
  const sHash = sessionHash(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin()
    .from("customer_sessions")
    .insert({
      tenant_id: tenantId,
      email: normalizeEmail(email),
      phone_last4_hash: phoneHash,
      session_hash: sHash,
      expires_at: expires,
    });
  if (error) throw new Error(`createSession failed: ${error.message}`);

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
    .select("id, email, phone_last4_hash, expires_at, revoked_at")
    .eq("tenant_id", tenantId)
    .eq("session_hash", sHash)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as { email: string; phone_last4_hash: string };
}

export async function listCertificatesForCustomer(tenantId: string, phoneHash: string) {
  const selectCols = "public_id, customer_name, vehicle_info_json, created_at, status";
  const db = admin();

  // void以外の全ステータスを取得（active・その他を含む）
  // ※ status='active' のみに絞ると、ダッシュボードの件数と実際の一覧に差異が生じるため、
  //   void（無効）のみ除外して残りは全件返す
  const { data: r1 } = await db
    .from("certificates")
    .select(selectCols)
    .eq("tenant_id", tenantId)
    .eq("customer_phone_last4_hash", phoneHash)
    .neq("status", "void")
    .order("created_at", { ascending: false });
  return r1 ?? [];
}

/** 顧客の施工履歴（vehicle_histories）を取得 */
export async function listHistoryForCustomer(tenantId: string, phoneHash: string) {
  const certs = await listCertificatesForCustomer(tenantId, phoneHash);
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
    .order("performed_at", { ascending: false })
    .limit(50);
  return histories ?? [];
}

/** 顧客の今後の予約を取得 */
export async function listReservationsForCustomer(tenantId: string, phoneHash: string) {
  const certs = await listCertificatesForCustomer(tenantId, phoneHash);
  if (!certs || certs.length === 0) return [];

  const customerNames = [...new Set(certs.map((c: { customer_name: string | null }) => c.customer_name).filter(Boolean))];
  if (customerNames.length === 0) return [];

  const db = admin();
  const { data: customers } = await db
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", customerNames[0])
    .limit(1);
  if (!customers || customers.length === 0) return [];

  const customerId = customers[0].id;
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
export async function getCustomerProfile(tenantId: string, phoneHash: string) {
  const certs = await listCertificatesForCustomer(tenantId, phoneHash);
  if (!certs || certs.length === 0) return null;

  const customerNames = [...new Set(certs.map((c: { customer_name: string | null }) => c.customer_name).filter(Boolean))];
  if (customerNames.length === 0) return null;

  const { data: customers } = await admin()
    .from("customers")
    .select("id, name, email, phone")
    .eq("tenant_id", tenantId)
    .eq("name", customerNames[0])
    .limit(1);
  if (!customers || customers.length === 0) {
    return { name: customerNames[0], email: null, phone: null, certificateCount: certs.length };
  }

  return {
    name: customers[0].name,
    email: customers[0].email ?? null,
    phone: customers[0].phone ?? null,
    certificateCount: certs.length,
  };
}