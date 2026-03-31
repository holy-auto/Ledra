import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  GLOBAL_PORTAL_COOKIE,
  createGlobalSession,
  getLatestGlobalCodeRow,
  globalOtpCodeHash,
  listPortalMemberships,
  markGlobalCodeAttempt,
  markGlobalCodeUsed,
} from "@/lib/customerPortalGlobal";
import { normalizeEmail, normalizeLast4 } from "@/lib/customerPortalServer";

const isSecureCookie = process.env.NODE_ENV === "production";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`portal-verify:${ip}`, { limit: 10, windowSec: 300 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "試行回数が多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const email = normalizeEmail(String(body.email ?? ""));
    const last4 = normalizeLast4(String(body.phone_last4 ?? body.last4 ?? ""));
    const code = String(body.code ?? "").trim();
    const preferredTenantSlug = String(body.preferred_tenant_slug ?? body.tenant ?? "").trim() || null;

    const row = await getLatestGlobalCodeRow(email, last4);
    if (!row) return NextResponse.json({ error: "no_code" }, { status: 404 });
    if (row.used_at) return NextResponse.json({ error: "code_used" }, { status: 400 });
    if (new Date(row.expires_at).getTime() < Date.now())
      return NextResponse.json({ error: "code_expired" }, { status: 400 });

    const expected = globalOtpCodeHash(email, last4, code);
    if (expected !== row.code_hash) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      await markGlobalCodeAttempt(row.id, nextAttempts);
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }

    await markGlobalCodeUsed(row.id);
    const sess = await createGlobalSession(email, last4);
    const memberships = await listPortalMemberships(email, last4, preferredTenantSlug);

    let redirectTo = "/my/shops";
    if (preferredTenantSlug && memberships.some((m) => m.tenant_slug === preferredTenantSlug)) {
      redirectTo = `/customer/${encodeURIComponent(preferredTenantSlug)}?from=portal`;
    } else if (memberships.length === 1) {
      redirectTo = `/customer/${encodeURIComponent(memberships[0].tenant_slug)}?from=portal`;
    }

    const res = NextResponse.json({ ok: true, redirect_to: redirectTo, memberships_count: memberships.length });
    res.cookies.set(GLOBAL_PORTAL_COOKIE, sess.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e: any) {
    console.error("portal verify-code error", e);
    return NextResponse.json({ error: e?.message ?? "verify-code failed" }, { status: 500 });
  }
}
