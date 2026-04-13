import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
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
    let phoneLast4: string | undefined;

    if (tenantToken) {
      const tenantSession = await validateSession(tenantId, tenantToken);
      if (tenantSession) {
        phoneHash = tenantSession.phone_last4_hash;
        // 後方互換: セッションに平文 last4 が保存されていれば渡す
        if (tenantSession.phone_last4) phoneLast4 = tenantSession.phone_last4;
      }
    }

    if (!phoneHash && globalToken) {
      const portalAccess = await resolvePortalTenantAccessByGlobalToken(tenant_slug, globalToken);
      if (portalAccess) {
        phoneHash = portalAccess.phone_last4_hash;
        // 古い証明書（ハッシュなし）への後方互換のため平文の下4桁も保持
        if (portalAccess.phone_last4) phoneLast4 = portalAccess.phone_last4;
      }
    }

    if (!phoneHash) return apiUnauthorized();

    if (action === "history") {
      const history = await listHistoryForCustomer(tenantId, phoneHash, phoneLast4);
      return NextResponse.json({ ok: true, history });
    }

    if (action === "reservations") {
      const reservations = await listReservationsForCustomer(tenantId, phoneHash, phoneLast4);
      return NextResponse.json({ ok: true, reservations });
    }

    if (action === "profile") {
      const profile = await getCustomerProfile(tenantId, phoneHash, phoneLast4);
      return NextResponse.json({ ok: true, profile });
    }

    const rows = await listCertificatesForCustomer(tenantId, phoneHash, phoneLast4);

    return NextResponse.json({ ok: true, rows });
  } catch (e: unknown) {
    return apiInternalError(e, "customer/list");
  }
}
