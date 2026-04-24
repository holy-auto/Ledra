import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GLOBAL_PORTAL_COOKIE, listPortalMemberships, validateGlobalSession } from "@/lib/customerPortalGlobal";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const preferredTenantSlug = (searchParams.get("tenant") ?? "").trim() || null;

    const c = await cookies();
    const token = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";
    if (!token) return apiUnauthorized();

    const sess = await validateGlobalSession(token);
    if (!sess) return apiUnauthorized();

    const shops = await listPortalMemberships(sess.email, sess.phone_last4, preferredTenantSlug);
    return apiJson({ ok: true, shops });
  } catch (e: unknown) {
    return apiInternalError(e, "portal/memberships");
  }
}
