import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Pre-launch middleware: redirect all marketing pages to the countdown page.
 * Admin, login, API, and other non-marketing routes remain accessible.
 */

const ALLOWED_PATHS = new Set(["/", "/contact"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate marketing routes (handled by the (marketing) route group)
  const MARKETING_PATHS = [
    "/pricing",
    "/faq",
    "/for-shops",
    "/for-insurers",
    "/privacy",
    "/terms",
    "/tokusho",
  ];

  if (MARKETING_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match marketing pages only.
     * Exclude _next, api, static files, and other app routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|admin|login|signup|forgot-password|reset-password|join|insurer|customer|c/|market|probe).*)",
  ],
};
