import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Next.js runs this for every request handled by the proxy (formerly middleware)
export function proxy(_req: NextRequest) {
  return NextResponse.next();
}

// Also provide default export for compatibility
export default proxy;