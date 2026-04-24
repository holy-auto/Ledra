import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession, getCustomerProfile } from "@/lib/customerPortalServer";
import { GLOBAL_PORTAL_COOKIE, resolvePortalTenantAccessByGlobalToken } from "@/lib/customerPortalGlobal";
import { notifySlack } from "@/lib/slack";

async function resolveSession(tenantSlug: string) {
  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return null;

  const c = await cookies();
  const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
  const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

  let phoneHash = "";
  let email: string | undefined;

  if (tenantToken) {
    const sess = await validateSession(tenantId, tenantToken);
    if (sess) {
      phoneHash = sess.phone_last4_hash;
      email = sess.email;
    }
  }
  if (!phoneHash && globalToken) {
    const access = await resolvePortalTenantAccessByGlobalToken(tenantSlug, globalToken);
    if (access) {
      phoneHash = access.phone_last4_hash;
      if ("email" in access && typeof access.email === "string") email = access.email;
    }
  }

  if (!phoneHash) return null;
  return { tenantId, phoneHash, email };
}

/** GET /api/customer/inquiry?tenant=xxx — 顧客の問い合わせ一覧 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = (searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("missing tenant");

    const sess = await resolveSession(tenantSlug);
    if (!sess) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(sess.tenantId);
    const { data, error } = await admin
      .from("customer_inquiries")
      .select("id, subject, message, status, admin_reply, replied_at, created_at")
      .eq("tenant_id", sess.tenantId)
      .eq("phone_last4_hash", sess.phoneHash)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return apiInternalError(error, "customer/inquiry GET");

    return apiJson({ ok: true, inquiries: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "customer/inquiry GET");
  }
}

/** POST /api/customer/inquiry — 問い合わせ送信 */
export async function POST(req: NextRequest) {
  // Customer portal inquiries — strict per-IP limit to prevent spam campaigns.
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

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
    const profile = await getCustomerProfile(sess.tenantId, sess.phoneHash, undefined, sess.email).catch(
      (): null => null,
    );
    const customerName = profile?.name ?? null;

    const { admin } = createTenantScopedAdmin(sess.tenantId);
    const { data, error } = await admin
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

    try {
      await notifySlack(process.env.SLACK_CUSTOMER_INQUIRY_WEBHOOK_URL, {
        text: `:speech_balloon: 顧客ポータル新規問い合わせ: *${subject || "お問い合わせ"}*`,
        fields: [
          { title: "件名", value: subject || "お問い合わせ", short: true },
          { title: "テナント", value: tenantSlug, short: true },
          ...(customerName ? [{ title: "お客様", value: customerName, short: true }] : []),
          { title: "問い合わせID", value: String(data.id), short: true },
          { title: "本文", value: message.slice(0, 500) },
        ],
      });
    } catch (err) {
      console.error("[customer/inquiry] slack notify failed:", err);
    }

    return apiJson({ ok: true, id: data.id }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "customer/inquiry POST");
  }
}
