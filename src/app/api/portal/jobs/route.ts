/**
 * GET /api/portal/jobs?tenant=<slug>
 *
 * 顧客マイページ「作業進捗確認」用。指定テナント内の顧客の予約 (案件) を
 * ステータス・車両情報つきで返す。
 *
 * 認証は /api/customer/list と同じ二段構え:
 *  - per-tenant の CUSTOMER_COOKIE (validateSession)
 *  - global portal の GLOBAL_PORTAL_COOKIE (resolvePortalTenantAccessByGlobalToken)
 * どちらかで当該テナントの顧客スコープが解決できれば許可。
 */
import { cookies } from "next/headers";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { CUSTOMER_COOKIE, getTenantIdBySlug, listJobsForCustomer, validateSession } from "@/lib/customerPortalServer";
import { GLOBAL_PORTAL_COOKIE, resolvePortalTenantAccessByGlobalToken } from "@/lib/customerPortalGlobal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenant_slug = (searchParams.get("tenant") ?? "").trim();
    if (!tenant_slug) return apiValidationError("missing tenant");

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const c = await cookies();
    const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
    const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

    let phoneHash = "";
    let phoneLast4: string | undefined;
    let sessionEmail: string | undefined;
    let sessionCustomerId: string | null = null;

    if (tenantToken) {
      const tenantSession = await validateSession(tenantId, tenantToken);
      if (tenantSession) {
        phoneHash = tenantSession.phone_last4_hash;
        if (tenantSession.phone_last4) phoneLast4 = tenantSession.phone_last4;
        sessionEmail = tenantSession.email;
        sessionCustomerId = tenantSession.customer_id;
      }
    }

    if (!phoneHash && globalToken) {
      const portalAccess = await resolvePortalTenantAccessByGlobalToken(tenant_slug, globalToken);
      if (portalAccess) {
        phoneHash = portalAccess.phone_last4_hash;
        if (portalAccess.phone_last4) phoneLast4 = portalAccess.phone_last4;
        if ("email" in portalAccess && typeof portalAccess.email === "string") {
          sessionEmail = portalAccess.email;
        }
      }
    }

    if (!phoneHash) return apiUnauthorized();

    const jobs = await listJobsForCustomer(tenantId, phoneHash, phoneLast4, sessionEmail, sessionCustomerId);
    return apiJson({ ok: true, jobs });
  } catch (e: unknown) {
    return apiInternalError(e, "portal/jobs");
  }
}
