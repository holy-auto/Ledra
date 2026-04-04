/**
 * Next.js Middleware
 *
 * proxy.ts の既存ロジック（CSRF保護・セッションリフレッシュ・ページ保護）に加えて、
 * API ルートのデフォルト deny ガードレールを実装。
 *
 * レイヤー構成:
 *   1. Static asset skip
 *   2. CSRF protection (API mutations)
 *   3. API route guard (デフォルト deny — 認証済みか公開パスのみ通す)
 *   4. Hidden feature redirect
 *   5. Page-level auth redirect
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── Page-level public prefixes (no session required) ───
const PUBLIC_PAGE_PREFIXES = [
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

// ─── API routes that handle their own authentication ───
// These are NOT unprotected — each has its own auth mechanism:
//   webhooks: signature verification
//   cron: Vercel cron signature / CRON_SECRET
//   customer/portal: OTP token + session cookie
//   signature session/sign/verify: one-time token
//   external: API key
//   health/probe: intentionally public
//   mobile: Bearer token
//   stripe/line: webhook signature
const API_SELF_AUTH_PREFIXES = [
  "/api/webhooks/",         // Signature verification per provider
  "/api/cron/",             // Vercel cron signature / CRON_SECRET
  "/api/customer/",         // OTP token + session cookie
  "/api/portal/",           // OTP token + session cookie
  "/api/signature/",        // One-time token based
  "/api/external/",         // API key authentication
  "/api/health",            // Intentionally public
  "/api/mobile/",           // Bearer token auth
  "/api/stripe/",           // Stripe webhook signature
  "/api/line/",             // LINE webhook signature
  "/api/qstash/",           // Upstash QStash signature verification
  "/api/certificate/pdf",   // Public certificate PDF via public_id
  "/api/join/",             // Corporate join flow (own OTP auth)
  "/api/template-options/", // Public template preview
  "/api/contact",           // Public contact form (rate-limited)
  "/api/signup",            // Public signup flow
  "/api/announcements",     // Public announcements (optional auth)
];

/**
 * CSRF protection for API mutation routes.
 * Returns a 403 response if the request is cross-origin, or null to continue.
 */
function csrfCheck(request: NextRequest): NextResponse | null {
  const { method, nextUrl } = request;

  if (!nextUrl.pathname.startsWith("/api/")) return null;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;

  // CSRF チェック不要なルート（外部サービスからの server-to-server コール）
  if (nextUrl.pathname.startsWith("/api/mobile/")) return null;
  if (nextUrl.pathname.startsWith("/api/webhooks/")) return null;
  if (nextUrl.pathname.startsWith("/api/stripe/webhook")) return null;
  if (nextUrl.pathname.startsWith("/api/line/webhook")) return null;
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

/**
 * API route guard — デフォルト deny
 *
 * 自前認証ルート以外の /api/* は Supabase セッションが必要。
 * セッションがなければ 401 を返す（リダイレクトではなく JSON エラー）。
 *
 * これは「認証チェック忘れ」を防ぐセーフティネット。
 * 各ハンドラの resolveCallerWithRole / resolveInsurerCaller は引き続き必要
 * （ロールチェック・テナント分離はミドルウェアでは行わない）。
 */
async function apiGuard(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) return null;

  // 自前認証ルートはスキップ
  if (API_SELF_AUTH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  // それ以外の /api/* は Supabase セッション必須
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // 環境変数未設定 → fail closed
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication service unavailable" },
      { status: 401 },
    );
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "認証が必要です" },
      { status: 401 },
    );
  }

  // セッション有効 → 通過（詳細なロールチェックは各ハンドラに委任）
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip static assets
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  // 2. CSRF protection for API mutations
  const csrfResponse = csrfCheck(request);
  if (csrfResponse) return csrfResponse;

  // 3. API route guard (デフォルト deny)
  const apiGuardResponse = await apiGuard(request);
  if (apiGuardResponse) return apiGuardResponse;

  // 4. Block unreleased features — redirect to admin dashboard
  if (HIDDEN_ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin";
    return NextResponse.redirect(redirectUrl);
  }

  // 5. Block unreleased market routes
  if (
    pathname.startsWith("/market") &&
    !pathname.startsWith("/market/login") &&
    !pathname.startsWith("/market/register")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  // 6. Marketing pages and public routes: pass through with session refresh
  if (
    pathname.startsWith("/api/") ||
    MARKETING_PATHS.includes(pathname) ||
    PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return refreshSession(request);
  }

  // 7. Protected page routes: refresh session then check auth
  return refreshSessionAndProtect(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)",
  ],
};

// ─── Session helpers (from proxy.ts) ───

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
      const payload = JSON.parse(
        atob(authCookie.value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      const expiresAt = payload.exp * 1000;
      const fiveMinutes = 5 * 60 * 1000;
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

  await supabase.auth.getUser();

  return response;
}

/** Refresh session + redirect unauthenticated users */
async function refreshSessionAndProtect(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
