import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─── Global API rate limiter (120 req / 60s per IP) ───
let globalLimiter: Ratelimit | null = null;

function getGlobalLimiter(): Ratelimit | null {
  if (globalLimiter) return globalLimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  globalLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(120, "60 s"),
    prefix: "rl:global",
  });
  return globalLimiter;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Global rate limit check for all API routes.
 * Returns a 429 response if exceeded, or null to continue.
 */
async function globalRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return null;

  // Skip webhook routes — they have their own rate limits and come from trusted servers
  if (pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/stripe/webhook") || pathname.startsWith("/api/line/webhook")) {
    return null;
  }

  // Skip cron routes — server-to-server calls
  if (pathname.startsWith("/api/cron/")) return null;

  const limiter = getGlobalLimiter();
  if (!limiter) {
    // Fail-closed in production
    if (process.env.NODE_ENV === "production") {
      console.error("[globalRateLimit] Redis not configured in production");
      return NextResponse.json(
        { error: "service_unavailable", message: "サービスが一時的に利用できません。" },
        { status: 503 },
      );
    }
    return null;
  }

  try {
    const ip = getClientIp(request);
    const result = await limiter.limit(ip);
    if (!result.success) {
      const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
      return NextResponse.json(
        { error: "rate_limited", message: "リクエスト回数の上限に達しました。しばらく経ってから再度お試しください。", retry_after: retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  } catch (e) {
    console.error("[globalRateLimit] Redis error:", e);
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "service_unavailable", message: "サービスが一時的に利用できません。" },
        { status: 503 },
      );
    }
  }

  return null;
}

const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/c/",
  "/customer/",
  "/insurer/login",
  "/insurer/forgot-password",
  "/insurer/reset-password",
  "/market/login",
  "/market/register",
  "/market/search",
  "/market/p/",
  "/api/",
  "/probe",
  "/agent/apply",
];

const MARKETING_PATHS = [
  "/", "/pricing", "/for-shops", "/for-insurers",
  "/faq", "/contact", "/privacy", "/terms", "/tokusho",
];

/** Unreleased feature routes — redirect to /admin until ready for launch */
const HIDDEN_ADMIN_PREFIXES = [
  "/admin/price-stats",
  "/admin/insurers",
];

// ─── Content-Type validation for API mutation routes ───
const NON_JSON_ROUTES = new Set([
  "/api/webhooks/resend",
  "/api/webhooks/cloudsign",
  "/api/webhooks/square",
  "/api/stripe/webhook",
  "/api/line/webhook",
  "/api/certificate/pdf",
  "/api/admin/market-vehicles/images",
  "/api/admin/logo",
  "/api/certificates/images/upload",
  "/api/vehicles/import-csv",
  "/api/template-options/upload-logo",
]);

function isNonJsonRoute(pathname: string): boolean {
  return NON_JSON_ROUTES.has(pathname) || Array.from(NON_JSON_ROUTES).some((r) => pathname.startsWith(r));
}

/**
 * Validate Content-Type header for API mutation requests.
 * Returns a 415 response if Content-Type is invalid, or null to continue.
 */
function contentTypeCheck(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!pathname.startsWith("/api/")) return null;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  if (isNonJsonRoute(pathname)) return null;

  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength !== null && contentLength !== "0";

  if (hasBody && !contentType.includes("application/json") && !contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "unsupported_content_type", message: "Content-Type must be application/json" },
      { status: 415 },
    );
  }

  return null;
}

/**
 * CSRF protection for API mutation routes.
 * Returns a 403 response if the request is cross-origin, or null to continue.
 */
function csrfCheck(request: NextRequest): NextResponse | null {
  const { method, nextUrl } = request;

  if (!nextUrl.pathname.startsWith("/api/")) return null;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;

  // モバイルアプリは Bearer Token 認証のため CSRF チェック不要
  if (nextUrl.pathname.startsWith("/api/mobile/")) return null;

  // Webhook は外部サービスからの server-to-server コールのため CSRF チェック不要
  if (nextUrl.pathname.startsWith("/api/webhooks/")) return null;

  // Stripe webhook は Stripe SDK で署名検証するため CSRF チェック不要
  if (nextUrl.pathname.startsWith("/api/stripe/webhook")) return null;

  // LINE webhook は LINE SDK で署名検証するため CSRF チェック不要
  if (nextUrl.pathname.startsWith("/api/line/webhook")) return null;

  // Cron は外部スケジューラからの server-to-server コールのため CSRF チェック不要
  if (nextUrl.pathname.startsWith("/api/cron/")) return null;

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite && secFetchSite !== "same-origin") {
      return NextResponse.json(
        { error: "csrf_rejected", message: "Cross-origin request blocked" },
        { status: 403 },
      );
    }
    return null;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== host) {
      console.warn(`[CSRF] Blocked: origin=${origin} host=${host} path=${nextUrl.pathname}`);
      return NextResponse.json(
        { error: "csrf_rejected", message: "Cross-origin request blocked" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "csrf_rejected", message: "Invalid origin" },
      { status: 403 },
    );
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return NextResponse.next();
  }

  // Global rate limit for API routes
  const rateLimitResponse = await globalRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  // Content-Type validation for API mutations
  const contentTypeResponse = contentTypeCheck(request);
  if (contentTypeResponse) return contentTypeResponse;

  // CSRF protection for API mutations
  const csrfResponse = csrfCheck(request);
  if (csrfResponse) return csrfResponse;

  // Block unreleased features — redirect to admin dashboard
  if (HIDDEN_ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin";
    return NextResponse.redirect(redirectUrl);
  }

  // Block unreleased market routes
  if (pathname.startsWith("/market") && !pathname.startsWith("/market/login") && !pathname.startsWith("/market/register")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  // Marketing pages and public routes: pass through
  if (MARKETING_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const response = await refreshSession(request);
    // Add security headers for API responses
    if (pathname.startsWith("/api/")) {
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Robots-Tag", "noindex");
    }
    return response;
  }

  // Protected routes: refresh session then check auth
  return refreshSessionAndProtect(request);
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (metadata)
     * - Public assets (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)",
  ],
};

/** Refresh Supabase session cookies only when token is near expiry */
async function refreshSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  // Check if session token is near expiry before making external call
  const authCookie = request.cookies.getAll().find((c) => c.name.includes("auth-token"));
  if (authCookie?.value) {
    try {
      // Decode JWT payload to check exp (base64url)
      const payload = JSON.parse(atob(authCookie.value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      const expiresAt = payload.exp * 1000;
      const fiveMinutes = 5 * 60 * 1000;
      // Skip refresh if token has >5 min left
      if (expiresAt - Date.now() > fiveMinutes) {
        return response;
      }
    } catch {
      // If we can't decode, fall through to refresh
    }
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Only called when token is near expiry or cannot be decoded
  await supabase.auth.getUser();

  return response;
}

/** Maximum idle time before forcing re-login (24 hours in milliseconds) */
const IDLE_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Check if the session has been idle too long by examining the JWT's `iat`.
 * Supabase SSR refreshes access tokens on activity, so a stale `iat` means
 * the user has not made any authenticated requests recently.
 * Returns true if the session should be considered expired.
 */
function isSessionIdleExpired(request: NextRequest): boolean {
  const authCookie = request.cookies.getAll().find((c) => c.name.includes("auth-token"));
  if (!authCookie?.value) return false; // No token — let getUser() handle it

  try {
    const payload = JSON.parse(
      atob(authCookie.value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    const issuedAt = (payload.iat ?? 0) * 1000;
    return Date.now() - issuedAt > IDLE_SESSION_TIMEOUT_MS;
  } catch {
    return false; // Can't decode — fall through to normal auth flow
  }
}

/** Redirect to the appropriate login page based on pathname */
function redirectToLogin(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const redirectUrl = request.nextUrl.clone();

  if (pathname.startsWith("/insurer")) {
    redirectUrl.pathname = "/insurer/login";
  } else if (pathname.startsWith("/market")) {
    redirectUrl.pathname = "/market/login";
  } else {
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
  }

  // Clear auth cookies so the client doesn't keep the stale session
  const response = NextResponse.redirect(redirectUrl);
  request.cookies.getAll()
    .filter((c) => c.name.includes("auth-token"))
    .forEach((c) => response.cookies.delete(c.name));
  return response;
}

/** Refresh session + redirect unauthenticated users */
async function refreshSessionAndProtect(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Server-side idle session timeout ──
  // If the access token was issued more than 24 hours ago, the user has been
  // idle (no requests that would trigger a Supabase token refresh). Force
  // re-login even if Supabase would still honour the refresh token.
  if (isSessionIdleExpired(request)) {
    console.warn(`[idle-timeout] Session expired for ${pathname}`);
    return redirectToLogin(request);
  }

  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(request);
  }

  return response;
}
