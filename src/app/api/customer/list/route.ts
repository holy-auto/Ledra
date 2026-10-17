import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import {
  CUSTOMER_COOKIE,
  getTenantIdBySlug,
  listCertificatesForCustomer,
  listHistoryForCustomer,
  listReservationsForCustomer,
  getCustomerProfile,
  validateSession,
} from "@/lib/customerPortalServer";
import { GLOBAL_PORTAL_COOKIE, resolvePortalTenantAccessByGlobalToken } from "@/lib/customerPortalGlobal";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenant_slug = (searchParams.get("tenant") ?? "").trim();
    const action = searchParams.get("action") ?? "";
    if (!tenant_slug) return apiValidationError("missing tenant");

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const c = await cookies();
    const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
    const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

    // データの範囲は本人と確定した customer_id だけで決める（下4桁ハッシュでは引かない）。
    let customerId: string | null = null;
    // 連絡先の自己登録 (/api/customer/profile) はテナントのセッションでしか通らない。
    let canEditContact = false;

    if (tenantToken) {
      const tenantSession = await validateSession(tenantId, tenantToken);
      if (tenantSession) {
        customerId = tenantSession.customer_id;
        canEditContact = true;
      }
    }

    if (!customerId && globalToken) {
      const portalAccess = await resolvePortalTenantAccessByGlobalToken(tenant_slug, globalToken);
      if (portalAccess) customerId = portalAccess.customer_id;
    }

    if (!customerId) return apiUnauthorized();

    if (action === "history") {
      const history = await listHistoryForCustomer(tenantId, customerId);
      return apiJson({ ok: true, history });
    }

    if (action === "reservations") {
      const reservations = await listReservationsForCustomer(tenantId, customerId);
      return apiJson({ ok: true, reservations });
    }

    if (action === "profile") {
      const profile = await getCustomerProfile(tenantId, customerId);
      // フォームを出してから 401 にしないよう、UI に伝える。
      return apiJson({ ok: true, profile: profile ? { ...profile, canEditContact } : null });
    }

    const rows = await listCertificatesForCustomer(tenantId, customerId);

    return apiJson({ ok: true, rows });
  } catch (e: unknown) {
    return apiInternalError(e, "customer/list");
  }
}
