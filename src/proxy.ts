import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveRequestId } from "@/lib/logger";
import { checkRateLimit } from "@/lib/api/rateLimit";

/**
 * Generate a cryptographically random nonce for CSP script-src.
 * 16 bytes → base64 (22 chars). New per request.
 */
function generateCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Build the Content-Security-Policy header value for a given nonce.
 *
 * 'unsafe-inline' is intentionally dropped from script-src: every inline
 * `<script>` in the tree must now carry this nonce (read via
 * `headers().get('x-nonce')` in server components). External scripts from
 * allowlisted origins (Stripe.js, Vercel Analytics/Speed Insights, Sentry
 * CDN) are still permitted without a nonce.
 *
 * 'unsafe-eval' is only present in development to accommodate the Next.js
 * dev server + HMR.
 */
function buildCspHeader(nonce: string, isDev: boolean): string {
  const unsafeEval = isDev ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${unsafeEval} https://js.stripe.com https://vercel.live https://*.vercel-scripts.com https://*.sentry-cdn.com`,
    // Styles still need 'unsafe-inline' — Tailwind + react-pdf + Next.js
    // font loader inject inline <style> tags. Nonce propagation to Next.js's
    // CSS injection is not supported at time of writing.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://api.qrserver.com",
    "font-src 'self' data: https://cdn.jsdelivr.net",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://vercel.live https://*.vercel-scripts.com https://*.upstash.io",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://vercel.live",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
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
  "/",
  "/pricing",
  "/for-shops",
  "/for-insurers",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/tokusho",
];

/** Unreleased feature routes — redirect to /admin until ready for launch */
const HIDDEN_ADMIN_PREFIXES = ["/admin/price-stats", "/admin/insurers"];

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
      return NextResponse.json({ error: "csrf_rejected", message: "Cross-origin request blocked" }, { status: 403 });
    }
    return null;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== host) {
      console.warn(`[CSRF] Blocked: origin=${origin} host=${host} path=${nextUrl.pathname}`);
      return NextResponse.json({ error: "csrf_rejected", message: "Cross-origin request blocked" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "csrf_rejected", message: "Invalid origin" }, { status: 403 });
  }

  return null;
}

/**
 * Ensure every request carries an `x-request-id` header so that downstream
 * handlers + logger can emit a single correlation id. Vercel also sets
 * `x-vercel-id`; we reuse that when available.
 */
function ensureRequestId(request: NextRequest) {
  if (request.headers.get("x-request-id")) return request.headers.get("x-request-id")!;
  const id = resolveRequestId({ headers: request.headers });
  request.headers.set("x-request-id", id);
  return id;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  const requestId = ensureRequestId(request);

  // Generate CSP nonce. Stored on the request (x-nonce) so server components
  // can retrieve it via `headers().get('x-nonce')` and attach to inline scripts.
  const nonce = generateCspNonce();
  request.headers.set("x-nonce", nonce);
  const cspHeader = buildCspHeader(nonce, process.env.NODE_ENV === "development");

  // Blanket rate limit for /api/* — defense in depth for the 200+ routes that
  // do not set a per-route limit. 300 req / 60s / IP catches bulk scraping
  // without impacting normal authenticated usage. Webhook / cron / qstash /
  // health endpoints are skipped because their callers (Stripe / Square /
  // QStash / Vercel Cron / uptime monitors) are server-to-server and already
  // authenticated via HMAC / secret headers.
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/webhooks/") &&
    !pathname.startsWith("/api/cron/") &&
    !pathname.startsWith("/api/qstash/") &&
    !pathname.startsWith("/api/health") &&
    !pathname.startsWith("/api/stripe/webhook") &&
    !pathname.startsWith("/api/stripe/connect-webhook") &&
    !pathname.startsWith("/api/line/webhook")
  ) {
    const limited = await checkRateLimit(request, "middleware_default");
    if (limited) {
      limited.headers.set("x-request-id", requestId);
      return limited;
    }
  }

  // CSRF protection for API mutations
  const csrfResponse = csrfCheck(request);
  if (csrfResponse) {
    csrfResponse.headers.set("x-request-id", requestId);
    return csrfResponse;
  }

  // Block unreleased features — redirect to admin dashboard
  if (HIDDEN_ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin";
    const res = NextResponse.redirect(redirectUrl);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Block unreleased market routes
  if (
    pathname.startsWith("/market") &&
    !pathname.startsWith("/market/login") &&
    !pathname.startsWith("/market/register")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    const res = NextResponse.redirect(redirectUrl);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const response =
    MARKETING_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
      ? await refreshSession(request)
      : await refreshSessionAndProtect(request);

  response.headers.set("x-request-id", requestId);
  response.headers.set("Content-Security-Policy", cspHeader);

  // Defense-in-depth for raw binary responses (PDF / CSV exports) that do
  // not go through apiOk/apiError/apiJson helpers. Safe to always add
  // because they don't conflict with Cache-Control or Vary which routes
  // may customize.
  if (pathname.startsWith("/api/")) {
    if (!response.headers.has("x-robots-tag")) {
      response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    }
    if (!response.headers.has("pragma")) {
      response.headers.set("pragma", "no-cache");
    }
  }

  return response;
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
  // Forward the modified request headers (x-nonce / x-request-id set upstream
  // in proxy()) so that server components can read them via `headers()`.
  // `NextResponse.next({ request })` alone does NOT reliably forward header
  // mutations in Next.js; the `request.headers` must be passed explicitly.
  const response = NextResponse.next({ request: { headers: request.headers } });

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

/** Refresh session + redirect unauthenticated users */
async function refreshSessionAndProtect(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Forward the modified request headers (x-nonce / x-request-id set upstream
  // in proxy()) so that server components can read them via `headers()`.
  // `NextResponse.next({ request })` alone does NOT reliably forward header
  // mutations in Next.js; the `request.headers` must be passed explicitly.
  const response = NextResponse.next({ request: { headers: request.headers } });

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/admin")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }
    if (pathname.startsWith("/insurer")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/insurer/login";
      return NextResponse.redirect(redirectUrl);
    }
    if (pathname.startsWith("/market")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/market/login";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
