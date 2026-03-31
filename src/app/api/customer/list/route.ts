import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
    if (!tenant_slug) return NextResponse.json({ error: "missing tenant" }, { status: 400 });

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

    const c = await cookies();
    const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
    const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

    let phoneHash = "";

    if (tenantToken) {
      const tenantSession = await validateSession(tenantId, tenantToken);
      if (tenantSession) {
        phoneHash = tenantSession.phone_last4_hash;
      }
    }

    if (!phoneHash && globalToken) {
      const portalAccess = await resolvePortalTenantAccessByGlobalToken(tenant_slug, globalToken);
      if (portalAccess) {
        phoneHash = portalAccess.phone_last4_hash;
      }
    }

    if (!phoneHash) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (action === "history") {
      const history = await listHistoryForCustomer(tenantId, phoneHash);
      return NextResponse.json({ ok: true, history });
    }

    if (action === "reservations") {
      const reservations = await listReservationsForCustomer(tenantId, phoneHash);
      return NextResponse.json({ ok: true, reservations });
    }

    if (action === "profile") {
      const profile = await getCustomerProfile(tenantId, phoneHash);
      return NextResponse.json({ ok: true, profile });
    }

    const rows = await listCertificatesForCustomer(tenantId, phoneHash);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    console.error("customer list error", e);
    return NextResponse.json({ error: e?.message ?? "list failed" }, { status: 500 });
  }
}
