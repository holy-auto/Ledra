/**
 * GET /api/customer/delivery-consent?tenant=<slug> — 使用者本人が自分の「電子交付の承諾」状態を読む。 [G3/G4]
 *
 * 認証: 顧客ポータルセッション（customer_id 紐付きのみ。revoke POST と同じ線引き）。
 * 返り値 { status: "none" | "granted" | "revoked" }。撤回は同ディレクトリの revoke（POST）。
 */
import { cookies } from "next/headers";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import {
  deliveryConsentStatus,
  deliveryConsentText,
  DELIVERY_CONSENT_VERSION,
  type DeliveryConsentRow,
} from "@/lib/delivery/deliveryConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // revoke（POST）と同じ器のレート制限を読みにも掛ける（service role の DB 参照を無制限ポーリングさせない）。
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;
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

    // 本人が承諾する画面で開示文言を示すため、現行の文言と版も返す（承諾時に版を送り返してもらう）。
    return apiOk({
      status: deliveryConsentStatus((data as DeliveryConsentRow | null) ?? null),
      consent_text: deliveryConsentText(),
      consent_version: DELIVERY_CONSENT_VERSION,
    });
  } catch (e) {
    return apiInternalError(e, "customer/delivery-consent GET");
  }
}
