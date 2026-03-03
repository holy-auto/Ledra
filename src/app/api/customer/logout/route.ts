import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE, revokeSessionByToken } from "@/lib/customerPortalServer";

export async function POST() {
  const c = await cookies();
  const token = c.get(CUSTOMER_COOKIE)?.value;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CUSTOMER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });

  if (token) {
    try { await revokeSessionByToken(token); } catch { /* ignore */ }
  }
  return res;
}