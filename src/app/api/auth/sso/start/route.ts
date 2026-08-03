/**
 * POST /api/auth/sso/start
 *
 * Begin a SAML SSO flow. Body:
 *   { domain: "acme.co.jp", next?: "/admin/certificates" }
 *
 * Response:
 *   200 { url: <IdP redirect URL> }   — caller should redirect the browser.
 *   400 { message: "invalid_domain" } — malformed input.
 *   404 { message: "sso_not_configured" } — no SAML provider for that domain
 *        in Supabase Auth (`auth.sso_domains`).
 *   501 { message: "sso_unsupported_supabase_version" } — supabase-js lacks
 *        signInWithSSO, the project may not be on a Pro plan.
 *
 * The browser is responsible for navigating to the returned URL. We do NOT
 * issue a 302 redirect here so that fetch() callers (the SSO button on the
 * login page) can handle errors inline; redirecting from a POST also fights
 * with Next's server-action flow.
 *
 * Rate limit: 5 starts per IP per minute (cheap UX brake — the actual
 * IdP-side rate limiting is what protects against enumeration).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { startSsoSignIn } from "@/lib/auth/sso";
import { resolveBaseUrl } from "@/lib/url";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";

const schema = z.object({
  domain: z.string().trim().min(3).max(253),
  next: z.string().trim().max(500).optional(),
});

function safeNext(value: string | undefined): string | null {
  if (!value) return null;
  // Only allow same-origin paths to avoid open-redirect via SSO callback chain.
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`sso-start:${ip}`, { limit: 5, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "リクエストが多すぎます。少し待ってから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid_payload");
    }
    const next = safeNext(parsed.data.next);

    const supabase = await createClient();
    // PKCE(SAML): signInWithSSO の verifier Cookie はリクエストオリジンに張られる。
    // コールバックも同一オリジンへ戻さないと exchangeCodeForSession が失敗する。
    const baseUrl = resolveBaseUrl({ req, preferRequestOrigin: true });
    const callbackPath = next ? `/auth/callback?next=${encodeURIComponent(next)}` : "/auth/callback";

    const result = await startSsoSignIn(supabase, {
      domain: parsed.data.domain,
      redirectTo: `${baseUrl}${callbackPath}`,
    });

    if ("error" in result) {
      switch (result.error) {
        case "invalid_domain":
          return apiValidationError("invalid_domain");
        case "sso_unsupported_supabase_version":
          return apiJson(
            { error: "sso_unsupported", message: "Supabase の SAML SSO 機能が有効化されていません。" },
            { status: 501 },
          );
        default:
          // signInWithSSO errors typically mean "no IdP registered for this domain".
          // Don't leak the internal message; return 404 with a generic hint.
          logger.warn("sso start failed", { error: result.error });
          return apiJson(
            { error: "sso_not_configured", message: "このドメインの SSO 設定が見つかりません。" },
            { status: 404 },
          );
      }
    }

    return NextResponse.json({ url: result.url });
  } catch (e: unknown) {
    return apiInternalError(e, "auth/sso/start");
  }
}
