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
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

const isSecureCookie = process.env.NODE_ENV === "production";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`portal-verify:${ip}`, { limit: 10, windowSec: 300 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "試行回数が多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const email = normalizeEmail(String(body.email ?? ""));
    let last4: string;
    try {
      last4 = normalizeLast4(String(body.phone_last4 ?? body.last4 ?? ""));
    } catch {
      return apiValidationError("電話番号の下4桁を正しく入力してください。");
    }
    const code = String(body.code ?? "").trim();
    const preferredTenantSlug = String(body.preferred_tenant_slug ?? body.tenant ?? "").trim() || null;

    const row = await getLatestGlobalCodeRow(email, last4);
    if (!row) return apiNotFound("no_code");
    if (row.used_at) return apiValidationError("code_used");
    if (new Date(row.expires_at).getTime() < Date.now()) return apiValidationError("code_expired");

    const expected = globalOtpCodeHash(email, last4, code);
    if (expected !== row.code_hash) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      await markGlobalCodeAttempt(row.id, nextAttempts);
      return apiValidationError("invalid_code");
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

    const res = apiJson({ ok: true, redirect_to: redirectTo, memberships_count: memberships.length });
    res.cookies.set(GLOBAL_PORTAL_COOKIE, sess.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e: unknown) {
    return apiInternalError(e, "portal/verify-code");
  }
}
