import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return NextResponse.next();
  }

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
    return refreshSession(request);
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

/** Refresh Supabase session cookies on every request */
function refreshSession(request: NextRequest) {
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

  // Fire getUser to refresh the session token
  supabase.auth.getUser();

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
