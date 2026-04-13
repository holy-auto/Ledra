import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import {
  CUSTOMER_COOKIE,
  getTenantIdBySlug,
  validateSession,
  getCustomerProfile,
} from "@/lib/customerPortalServer";
import { GLOBAL_PORTAL_COOKIE, resolvePortalTenantAccessByGlobalToken } from "@/lib/customerPortalGlobal";

async function resolveSession(tenantSlug: string) {
  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return null;

  const c = await cookies();
  const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
  const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

  let phoneHash = "";

  if (tenantToken) {
    const sess = await validateSession(tenantId, tenantToken);
    if (sess) phoneHash = sess.phone_last4_hash;
  }
  if (!phoneHash && globalToken) {
    const access = await resolvePortalTenantAccessByGlobalToken(tenantSlug, globalToken);
    if (access) phoneHash = access.phone_last4_hash;
  }

  if (!phoneHash) return null;
  return { tenantId, phoneHash };
}

/** GET /api/customer/inquiry?tenant=xxx — 顧客の問い合わせ一覧 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = (searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("missing tenant");

    const sess = await resolveSession(tenantSlug);
    if (!sess) return apiUnauthorized();

    const { data, error } = await getSupabaseAdmin()
      .from("customer_inquiries")
      .select("id, subject, message, status, admin_reply, replied_at, created_at")
      .eq("tenant_id", sess.tenantId)
      .eq("phone_last4_hash", sess.phoneHash)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return apiInternalError(error, "customer/inquiry GET");

    return NextResponse.json({ ok: true, inquiries: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "customer/inquiry GET");
  }
}

/** POST /api/customer/inquiry — 問い合わせ送信 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantSlug = (body?.tenant_slug ?? "").trim();
    const subject = (body?.subject ?? "お問い合わせ").trim().slice(0, 200);
    const message = (body?.message ?? "").trim();

    if (!tenantSlug) return apiValidationError("missing tenant_slug");
    if (!message) return apiValidationError("message is required");
    if (message.length > 2000) return apiValidationError("message too long");

    const sess = await resolveSession(tenantSlug);
    if (!sess) return apiUnauthorized();

    // 顧客名を取得（ベストエフォート）
    const profile = await getCustomerProfile(sess.tenantId, sess.phoneHash).catch(() => null);
    const customerName = profile?.name ?? null;

    const { data, error } = await getSupabaseAdmin()
      .from("customer_inquiries")
      .insert({
        tenant_id: sess.tenantId,
        customer_name: customerName,
        phone_last4_hash: sess.phoneHash,
        subject: subject || "お問い合わせ",
        message,
        status: "new",
      })
      .select("id")
      .single();

    if (error) return apiInternalError(error, "customer/inquiry POST");

    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "customer/inquiry POST");
  }
}
