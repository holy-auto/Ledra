import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE, revokeSessionByToken } from "@/lib/customerPortalServer";
import { GLOBAL_PORTAL_COOKIE, revokeGlobalSessionByToken } from "@/lib/customerPortalGlobal";
import { apiJson, applySecurityHeaders } from "@/lib/api/response";

export async function POST() {
  const c = await cookies();
  const portalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value;
  const tenantToken = c.get(CUSTOMER_COOKIE)?.value;

  // Direct NextResponse so that we can set clearing cookies; then apply
  // default security headers uniformly.
  const res = applySecurityHeaders(apiJson({ ok: true }));
  res.cookies.set(GLOBAL_PORTAL_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(CUSTOMER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  if (portalToken) {
    try {
      await revokeGlobalSessionByToken(portalToken);
    } catch {
      /* ignore */
    }
  }
  if (tenantToken) {
    try {
      await revokeSessionByToken(tenantToken);
    } catch {
      /* ignore */
    }
  }

  return res;
}
