import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE,
  getTenantIdBySlug,
  listCertificatesForCustomer,
  validateSession,
} from "@/lib/customerPortalServer";

const LAST4_COOKIE = "hc_l4";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenant_slug = (searchParams.get("tenant") ?? "").trim();
    if (!tenant_slug) return NextResponse.json({ error: "missing tenant" }, { status: 400 });

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

    const c = await cookies();
    const token = c.get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const sess = await validateSession(tenantId, token);
    if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const last4 = (c.get(LAST4_COOKIE)?.value ?? "").trim();
    const rows = await listCertificatesForCustomer(tenantId, sess.phone_last4_hash, last4);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "list failed" }, { status: 500 });
  }
}