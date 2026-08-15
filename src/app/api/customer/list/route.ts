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

    let phoneHash = "";
    let sessionEmail: string | undefined;
    // Phase 2: session に bake された customer_id があれば collision-proof path
    let sessionCustomerId: string | null = null;

    if (tenantToken) {
      const tenantSession = await validateSession(tenantId, tenantToken);
      if (tenantSession) {
        phoneHash = tenantSession.phone_last4_hash ?? "";
        sessionEmail = tenantSession.email ?? undefined;
        sessionCustomerId = tenantSession.customer_id;
      }
    }

    if (!phoneHash && !sessionCustomerId && globalToken) {
      const portalAccess = await resolvePortalTenantAccessByGlobalToken(tenant_slug, globalToken);
      if (portalAccess) {
        phoneHash = portalAccess.phone_last4_hash;
        if ("email" in portalAccess && typeof portalAccess.email === "string") {
          sessionEmail = portalAccess.email;
        }
      }
    }

    // LINE ログインのセッションは phone hash を持たず customer_id だけで scope される。
    // どちらも無ければ本当に未認証。
    if (!phoneHash && !sessionCustomerId) return apiUnauthorized();

    if (action === "history") {
      const history = await listHistoryForCustomer(tenantId, phoneHash, sessionEmail, sessionCustomerId);
      return apiJson({ ok: true, history });
    }

    if (action === "reservations") {
      const reservations = await listReservationsForCustomer(tenantId, phoneHash, sessionEmail, sessionCustomerId);
      return apiJson({ ok: true, reservations });
    }

    if (action === "profile") {
      const profile = await getCustomerProfile(tenantId, phoneHash, sessionEmail, sessionCustomerId);
      return apiJson({ ok: true, profile });
    }

    const rows = await listCertificatesForCustomer(tenantId, phoneHash, sessionEmail, sessionCustomerId);

    return apiJson({ ok: true, rows });
  } catch (e: unknown) {
    return apiInternalError(e, "customer/list");
  }
}
