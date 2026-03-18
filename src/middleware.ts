import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF protection middleware.
 *
 * For state-changing requests (POST/PUT/PATCH/DELETE) to /api/ routes,
 * validates that the Origin header matches the request host.
 * This prevents cross-site request forgery attacks.
 *
 * Safe methods (GET/HEAD/OPTIONS) are always allowed.
 * Non-API routes are always allowed (Next.js pages).
 */
export function middleware(request: NextRequest) {
  const { method, nextUrl } = request;

  // Only protect API mutation routes
  if (!nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  // Safe methods don't need CSRF protection
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return NextResponse.next();

  // Validate Origin header
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    // Allow server-to-server calls (cron jobs, webhooks) that lack Origin
    // but block browser requests without Origin
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite && secFetchSite !== "same-origin") {
      return NextResponse.json(
        { error: "csrf_rejected", message: "Cross-origin request blocked" },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  // Parse origin and compare with host
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;

    if (originHost !== host) {
      console.warn(`[CSRF] Blocked: origin=${origin} host=${host} path=${nextUrl.pathname}`);
      return NextResponse.json(
        { error: "csrf_rejected", message: "Cross-origin request blocked" },
        { status: 403 },
      );
    }
  } catch {
    // Malformed origin header
    return NextResponse.json(
      { error: "csrf_rejected", message: "Invalid origin" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
