import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Edge Middleware
 *
 * Responsibilities:
 * 1. Block non-JSON Content-Type on API mutation requests (POST/PUT/PATCH/DELETE)
 * 2. Add security headers on API responses
 * 3. Basic request validation
 */

// Routes that legitimately accept non-JSON bodies
const NON_JSON_ROUTES = new Set([
  "/api/webhooks/resend",
  "/api/webhooks/cloudsign",
  "/api/webhooks/square",
  "/api/stripe/webhook",
  "/api/line/webhook",
  "/api/certificate/pdf",
  "/api/admin/market-vehicles/images",
  "/api/admin/logo",
]);

// Routes that are public (no auth cookie expected)
const PUBLIC_API_PREFIXES = [
  "/api/certificate/",
  "/api/contact",
  "/api/health",
  "/api/external/",
  "/api/webhooks/",
  "/api/stripe/webhook",
  "/api/line/webhook",
  "/api/join/",
  "/api/signup",
  "/api/customer/request-code",
  "/api/customer/verify-code",
  "/api/customer/logout",
  "/api/cron/",
  "/api/qstash/",
  "/api/announcements",
  "/api/template-options",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isNonJsonRoute(pathname: string): boolean {
  return NON_JSON_ROUTES.has(pathname) || Array.from(NON_JSON_ROUTES).some((r) => pathname.startsWith(r));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const method = request.method;

  // 1. Content-Type validation for mutation requests
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !isNonJsonRoute(pathname)) {
    const contentType = request.headers.get("content-type") ?? "";
    // Allow requests with no body (some DELETEs) or JSON content type
    const contentLength = request.headers.get("content-length");
    const hasBody = contentLength !== null && contentLength !== "0";

    if (hasBody && !contentType.includes("application/json") && !contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "unsupported_content_type", message: "Content-Type must be application/json" },
        { status: 415 },
      );
    }
  }

  // 2. Basic auth cookie presence check for protected API routes
  // This is a lightweight check — actual auth verification happens in route handlers
  if (!isPublicRoute(pathname) && method !== "OPTIONS") {
    const hasAuthCookie =
      request.cookies.has("sb-access-token") ||
      request.cookies.has("sb-refresh-token") ||
      // Supabase v2 cookie naming convention
      Array.from(request.cookies.getAll()).some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

    const hasAuthHeader = request.headers.has("authorization");

    if (!hasAuthCookie && !hasAuthHeader) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
  }

  const response = NextResponse.next();

  // 3. Security headers for API responses
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
