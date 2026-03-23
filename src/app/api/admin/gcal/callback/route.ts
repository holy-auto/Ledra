import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndSave } from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/gcal/callback
 * Google OAuth コールバック
 * Google が認可後にリダイレクトしてくる先。
 * query params: code (認可コード), state (tenantId)
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // tenantId
  const error = url.searchParams.get("error");

  // ユーザーが拒否した場合
  if (error) {
    return NextResponse.redirect(
      new URL("/admin/reservations?gcal=denied", req.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/admin/reservations?gcal=error&reason=missing_params", req.url),
    );
  }

  try {
    await exchangeCodeAndSave(code, state);
    return NextResponse.redirect(
      new URL("/admin/reservations?gcal=connected", req.url),
    );
  } catch (e) {
    console.error("[gcal callback] token exchange failed:", e);
    return NextResponse.redirect(
      new URL("/admin/reservations?gcal=error&reason=token_exchange", req.url),
    );
  }
}
