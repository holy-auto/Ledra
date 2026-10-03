/**
 * GET /api/customer/delivery-consent?tenant=<slug> — 使用者本人が自分の「電子交付の承諾」状態を読む。 [G3/G4]
 *
 * 認証: 顧客ポータルセッション（customer_id 紐付きのみ。revoke POST と同じ線引き）。
 * 返り値 { status: "none" | "granted" | "revoked" }。撤回は同ディレクトリの revoke（POST）。
 */
import { cookies } from "next/headers";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { deliveryConsentStatus, type DeliveryConsentRow } from "@/lib/delivery/deliveryConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const slug = (new URL(req.url).searchParams.get("tenant") ?? "").trim();
    if (!slug) return apiNotFound("unknown tenant");
    const tenantId = await getTenantIdBySlug(slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const token = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
    const session = token ? await validateSession(tenantId, token) : null;
    if (!session?.customer_id) return apiUnauthorized();

    const admin = createServiceRoleAdmin("customer delivery-consent status — portal session bound to customer_id");
    const { data, error } = await admin
      .from("delivery_consents")
      .select("status, revoked_at")
      .eq("tenant_id", tenantId)
      .eq("customer_id", session.customer_id)
      .maybeSingle();
    if (error) return apiInternalError(error, "customer/delivery-consent GET");

    return apiOk({ status: deliveryConsentStatus((data as DeliveryConsentRow | null) ?? null) });
  } catch (e) {
    return apiInternalError(e, "customer/delivery-consent GET");
  }
}
