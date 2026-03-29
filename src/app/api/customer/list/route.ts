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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenant_slug = (searchParams.get("tenant") ?? "").trim();
    const action = searchParams.get("action") ?? "";
    if (!tenant_slug) return NextResponse.json({ error: "missing tenant" }, { status: 400 });

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

    const c = await cookies();
    const token = c.get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const sess = await validateSession(tenantId, token);
    if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (action === "history") {
      const history = await listHistoryForCustomer(tenantId, sess.phone_last4_hash);
      return NextResponse.json({ ok: true, history });
    }

    if (action === "reservations") {
      const reservations = await listReservationsForCustomer(tenantId, sess.phone_last4_hash);
      return NextResponse.json({ ok: true, reservations });
    }

    if (action === "profile") {
      const profile = await getCustomerProfile(tenantId, sess.phone_last4_hash);
      return NextResponse.json({ ok: true, profile });
    }

    const rows = await listCertificatesForCustomer(tenantId, sess.phone_last4_hash);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    console.error("customer list error", e);
    return NextResponse.json({ error: e?.message ?? "list failed" }, { status: 500 });
  }
}