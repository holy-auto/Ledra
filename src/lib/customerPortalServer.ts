import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER!;

export const CUSTOMER_COOKIE = "hc_cs";
export const OTP_TTL_MIN = 10;
export const SESSION_TTL_DAYS = 30;

function assertPepper() {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
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
  assertPepper();
  const v = normalizeLast4(last4);
  return sha256Hex(`v1|${tenantId}|${v}|${PEPPER}`);
}

export function otpCodeHash(tenantId: string, email: string, phoneHash: string, code: string) {
  assertPepper();
  return sha256Hex(`otp|v1|${tenantId}|${normalizeEmail(email)}|${phoneHash}|${code}|${PEPPER}`);
}

export function sessionHash(token: string) {
  assertPepper();
  return sha256Hex(`sess|v1|${token}|${PEPPER}`);
}

export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  const sb = createAdminClient();
  const { data } = await sb.from("tenants").select("id").eq("slug", slug).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function tenantHasPhoneHash(tenantId: string, phoneHash: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("certificates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_phone_last4_hash", phoneHash)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function createLoginCode(tenantId: string, email: string, phoneHash: string, code: string, expiresAtIso: string) {
  const sb = createAdminClient();
  const code_hash = otpCodeHash(tenantId, email, phoneHash, code);
  const { error } = await sb.from("customer_login_codes").insert({
    tenant_id: tenantId,
    email: normalizeEmail(email),
    phone_last4_hash: phoneHash,
    code_hash,
    expires_at: expiresAtIso,
  });
  if (error) throw new Error(`createLoginCode failed: ${error.message}`);
}

export async function getLatestValidCodeRow(tenantId: string, email: string, phoneHash: string) {
  const sb = createAdminClient();
  const { data } = await sb
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
  const sb = createAdminClient();
  const { error } = await sb.from("customer_login_codes").update({ attempts }).eq("id", id);
  if (error) throw new Error(`markCodeAttempt failed: ${error.message}`);
}

export async function markCodeUsed(id: string) {
  const sb = createAdminClient();
  const { error } = await sb.from("customer_login_codes").update({ used_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`markCodeUsed failed: ${error.message}`);
}

export async function createSession(tenantId: string, email: string, phoneHash: string, last4Plain: string) {
  const sb = createAdminClient();
  const token = randomHex(32);
  const sHash = sessionHash(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await sb.from("customer_sessions").insert({
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
  const sb = createAdminClient();
  const sHash = sessionHash(token);
  const { error } = await sb
    .from("customer_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_hash", sHash);
  if (error) throw new Error(`revokeSessionByToken failed: ${error.message}`);
}

export async function validateSession(tenantId: string, token: string) {
  const sb = createAdminClient();
  const sHash = sessionHash(token);
  const { data } = await sb
    .from("customer_sessions")
    .select("id, email, phone_last4_hash, phone_last4_plain, expires_at, revoked_at")
    .eq("tenant_id", tenantId)
    .eq("session_hash", sHash)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as { email: string; phone_last4_hash: string; phone_last4_plain: string | null };
}

export async function listCertificatesForCustomer(tenantId: string, phoneHash: string, last4Plain: string) {
  const sb = createAdminClient();
  // 新hash / 旧平文 / 旧バグ(hash列に平文) の3条件を1クエリで取得
  const { data } = await sb
    .from("certificates")
    .select("public_id, customer_name, vehicle_info_json, created_at, status")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`customer_phone_last4_hash.eq.${phoneHash},customer_phone_last4.eq.${last4Plain},customer_phone_last4_hash.eq.${last4Plain}`)
    .order("created_at", { ascending: false });
  return data ?? [];
}
