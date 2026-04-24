import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE, revokeSessionByToken } from "@/lib/customerPortalServer";
import { apiJson, applySecurityHeaders } from "@/lib/api/response";

export async function POST() {
  const c = await cookies();
  const token = c.get(CUSTOMER_COOKIE)?.value;

  // NextResponse is created directly so that we can set cookies on it; the
  // security headers (no-store / Vary: Cookie) are then applied uniformly.
  const res = applySecurityHeaders(apiJson({ ok: true }));
  res.cookies.set(CUSTOMER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  if (token) {
    try {
      await revokeSessionByToken(token);
    } catch {
      /* ignore */
    }
  }
  return res;
}
