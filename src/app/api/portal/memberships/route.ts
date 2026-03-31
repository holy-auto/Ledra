import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GLOBAL_PORTAL_COOKIE, listPortalMemberships, validateGlobalSession } from "@/lib/customerPortalGlobal";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const preferredTenantSlug = (searchParams.get("tenant") ?? "").trim() || null;

    const c = await cookies();
    const token = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const sess = await validateGlobalSession(token);
    if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const shops = await listPortalMemberships(sess.email, sess.phone_last4, preferredTenantSlug);
    return NextResponse.json({ ok: true, shops });
  } catch (e: any) {
    console.error("portal memberships error", e);
    return NextResponse.json({ error: e?.message ?? "memberships failed" }, { status: 500 });
  }
}
