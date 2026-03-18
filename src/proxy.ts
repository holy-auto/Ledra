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

export function proxy(request: NextRequest) {
  const { method, nextUrl } = request;
  const { pathname } = nextUrl;

  // --- CSRF protection for API mutation routes ---
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
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
    } else {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          console.warn(`[CSRF] Blocked: origin=${origin} host=${host} path=${pathname}`);
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
    }
  }

  // Skip static assets
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return NextResponse.next();
  }

  // Marketing pages and public routes: pass through
  if (MARKETING_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return refreshSession(request);
  }

  // Protected routes: refresh session then check auth
  return refreshSessionAndProtect(request);
}

export default proxy;

/** Refresh Supabase session cookies on every request */
function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
  let response = NextResponse.next({ request });

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
