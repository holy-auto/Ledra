import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  SESSION_TTL_DAYS,
  getTenantIdBySlug,
  listCertificatesForCustomer,
  normalizeEmail,
  normalizeLast4,
  phoneLast4Hash,
  randomHex,
  sha256Hex,
} from "@/lib/customerPortalServer";

const GLOBAL_PEPPER = (process.env.CUSTOMER_PORTAL_GLOBAL_AUTH_PEPPER ?? process.env.CUSTOMER_AUTH_PEPPER ?? "").trim();

export const GLOBAL_PORTAL_COOKIE = "hc_cp";
export const GLOBAL_OTP_TTL_MIN = 10;
export const GLOBAL_SESSION_TTL_DAYS = SESSION_TTL_DAYS;

export type PortalMembership = {
  tenant_id: string;
  tenant_slug: string;
  shop_name: string;
  display_name: string;
  certificate_count: number;
  reservation_count: number;
  next_reservation_at: string | null;
  line_linked: boolean;
  last_activity_at: string | null;
  phone_last4_hash: string;
  is_recent?: boolean;
};

function assertEnv() {
  if (!GLOBAL_PEPPER) throw new Error("Missing CUSTOMER_PORTAL_GLOBAL_AUTH_PEPPER or CUSTOMER_AUTH_PEPPER");
}

function admin() {
  assertEnv();
  return getSupabaseAdmin();
}

function digitsOnly(v: string | null | undefined) {
  return String(v ?? "").replace(/\D+/g, "");
}

function customerPhoneMatchesLast4(phone: string | null | undefined, last4: string) {
  const d = digitsOnly(phone);
  return d.length >= 4 && d.slice(-4) === last4;
}

export function globalIdentityHash(email: string, last4: string) {
  assertEnv();
  return sha256Hex(`portal-ident|v1|${normalizeEmail(email)}|${normalizeLast4(last4)}|${GLOBAL_PEPPER}`);
}

export function globalOtpCodeHash(email: string, last4: string, code: string) {
  assertEnv();
  return sha256Hex(`portal-otp|v1|${normalizeEmail(email)}|${normalizeLast4(last4)}|${code}|${GLOBAL_PEPPER}`);
}

export function globalSessionHash(token: string) {
  assertEnv();
  return sha256Hex(`portal-sess|v1|${token}|${GLOBAL_PEPPER}`);
}

export async function createGlobalLoginCode(email: string, last4: string, code: string, expiresAtIso: string) {
  const codeHash = globalOtpCodeHash(email, last4, code);
  const { error } = await admin()
    .from("customer_global_login_codes")
    .insert({
      email: normalizeEmail(email),
      phone_last4: normalizeLast4(last4),
      code_hash: codeHash,
      expires_at: expiresAtIso,
    });
  if (error) throw new Error(`createGlobalLoginCode failed: ${error.message}`);
}

export async function getLatestGlobalCodeRow(email: string, last4: string) {
  const { data, error } = await admin()
    .from("customer_global_login_codes")
    .select("id, code_hash, expires_at, used_at, attempts")
    .eq("email", normalizeEmail(email))
    .eq("phone_last4", normalizeLast4(last4))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestGlobalCodeRow failed: ${error.message}`);
  return data ?? null;
}

export async function markGlobalCodeAttempt(id: string, attempts: number) {
  const { error } = await admin().from("customer_global_login_codes").update({ attempts }).eq("id", id);
  if (error) throw new Error(`markGlobalCodeAttempt failed: ${error.message}`);
}

export async function markGlobalCodeUsed(id: string) {
  const { error } = await admin()
    .from("customer_global_login_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`markGlobalCodeUsed failed: ${error.message}`);
}

export async function createGlobalSession(email: string, last4: string) {
  const token = randomHex(32);
  const sessionHash = globalSessionHash(token);
  const expires = new Date(Date.now() + GLOBAL_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin()
    .from("customer_global_sessions")
    .insert({
      identity_hash: globalIdentityHash(email, last4),
      email: normalizeEmail(email),
      phone_last4: normalizeLast4(last4),
      session_hash: sessionHash,
      expires_at: expires,
    });
  if (error) throw new Error(`createGlobalSession failed: ${error.message}`);

  return { token, expiresAtIso: expires };
}

export async function revokeGlobalSessionByToken(token: string) {
  const { error } = await admin()
    .from("customer_global_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_hash", globalSessionHash(token));
  if (error) throw new Error(`revokeGlobalSessionByToken failed: ${error.message}`);
}

export async function validateGlobalSession(token: string) {
  const { data, error } = await admin()
    .from("customer_global_sessions")
    .select("id, email, phone_last4, expires_at, revoked_at")
    .eq("session_hash", globalSessionHash(token))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`validateGlobalSession failed: ${error.message}`);
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as { email: string; phone_last4: string };
}

async function listFutureReservationsByCustomer(tenantId: string, customerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin()
    .from("reservations")
    .select("id, scheduled_date, start_time, status")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .gte("scheduled_date", today)
    .neq("status", "cancelled")
    .order("scheduled_date", { ascending: true })
    .limit(10);
  if (error) throw new Error(`listFutureReservationsByCustomer failed: ${error.message}`);
  return data ?? [];
}

function reservationDateTimeIso(row: { scheduled_date?: string | null; start_time?: string | null }) {
  if (!row?.scheduled_date) return null;
  const time = (row.start_time ?? "09:00").toString().slice(0, 5);
  return `${row.scheduled_date}T${time}:00+09:00`;
}

export async function listPortalMemberships(email: string, last4: string, preferredTenantSlug?: string | null) {
  const emailNorm = normalizeEmail(email);
  const last4Norm = normalizeLast4(last4);
  const db = admin();

  const { data: customers, error: customerError } = await db
    .from("customers")
    .select("id, tenant_id, name, email, phone, line_user_id, line_link_status, updated_at")
    .ilike("email", emailNorm);

  if (customerError) throw new Error(`listPortalMemberships customers failed: ${customerError.message}`);
  if (!customers || customers.length === 0) return [] as PortalMembership[];

  const tenantIds = [...new Set(customers.map((c: { tenant_id: string }) => String(c.tenant_id)).filter(Boolean))];
  if (tenantIds.length === 0) return [] as PortalMembership[];

  const { data: tenants, error: tenantError } = await db.from("tenants").select("id, name, slug").in("id", tenantIds);
  if (tenantError) throw new Error(`listPortalMemberships tenants failed: ${tenantError.message}`);

  const tenantMap = new Map((tenants ?? []).map((t: { id: string; name: string; slug: string }) => [String(t.id), t]));

  const membershipsRaw = await Promise.all(
    tenantIds.map(async (tenantId) => {
      const tenant = tenantMap.get(String(tenantId));
      const slug = String(tenant?.slug ?? "").trim();
      if (!slug) return null;

      const tenantCustomers = (customers ?? []).filter(
        (c: { tenant_id: string }) => String(c.tenant_id) === String(tenantId),
      );
      const customer =
        tenantCustomers.find((c: { phone: string | null }) => customerPhoneMatchesLast4(c?.phone, last4Norm)) ??
        tenantCustomers[0] ??
        null;
      const phoneHash = phoneLast4Hash(String(tenantId), last4Norm);
      const certs = await listCertificatesForCustomer(String(tenantId), phoneHash, last4Norm);
      const phoneMatched = tenantCustomers.some((c: { phone: string | null }) =>
        customerPhoneMatchesLast4(c?.phone, last4Norm),
      );
      if (!phoneMatched && certs.length === 0) return null;

      const reservations = customer?.id
        ? await listFutureReservationsByCustomer(String(tenantId), String(customer.id))
        : [];

      const nextReservationAt =
        reservations.length > 0
          ? reservationDateTimeIso(reservations[0] as { scheduled_date?: string | null; start_time?: string | null })
          : null;
      const lastActivityAt = certs[0]?.created_at ?? customer?.updated_at ?? null;

      return {
        tenant_id: String(tenantId),
        tenant_slug: slug,
        shop_name: String(tenant?.name ?? slug),
        display_name: String(customer?.name ?? certs[0]?.customer_name ?? "お客様"),
        certificate_count: certs.length,
        reservation_count: reservations.length,
        next_reservation_at: nextReservationAt,
        line_linked: !!customer?.line_user_id || String(customer?.line_link_status ?? "") === "linked",
        last_activity_at: lastActivityAt,
        phone_last4_hash: phoneHash,
      } satisfies PortalMembership;
    }),
  );

  const memberships = membershipsRaw.filter(Boolean) as PortalMembership[];
  memberships.sort((a, b) => {
    if (preferredTenantSlug) {
      const ap = a.tenant_slug === preferredTenantSlug ? 1 : 0;
      const bp = b.tenant_slug === preferredTenantSlug ? 1 : 0;
      if (ap !== bp) return bp - ap;
    }
    const ad = Date.parse(a.last_activity_at ?? "");
    const bd = Date.parse(b.last_activity_at ?? "");
    if (!Number.isNaN(ad) && !Number.isNaN(bd) && ad !== bd) return bd - ad;
    return a.shop_name.localeCompare(b.shop_name, "ja");
  });

  return memberships.map((m, idx) => ({ ...m, is_recent: idx === 0 }));
}

export async function resolvePortalTenantAccessByGlobalToken(tenantSlug: string, token: string) {
  const sess = await validateGlobalSession(token);
  if (!sess) return null;

  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return null;

  const memberships = await listPortalMemberships(sess.email, sess.phone_last4, tenantSlug);
  const membership = memberships.find((m) => m.tenant_slug === tenantSlug);
  if (!membership) return null;

  return {
    tenantId,
    email: sess.email,
    phone_last4: sess.phone_last4,
    phone_last4_hash: membership.phone_last4_hash,
    membership,
  };
}
