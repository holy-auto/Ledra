import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndSave } from "@/lib/gcal/client";
import { createClient } from "@/lib/supabase/server";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { requireAal2OrResponse } from "@/lib/auth/stepUpGuard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/gcal/callback
 * Google OAuth コールバック
 * Google が認可後にリダイレクトしてくる先。
 * query params: code (認可コード), state (HMAC署名・ユーザー紐付け済みstate)
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // ── 認証チェック: ユーザーがログイン済みかつテナントメンバーであることを確認 ──
  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=unauthenticated", req.url));
  }

  // ユーザーが拒否した場合
  if (error) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=denied", req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=missing_params", req.url));
  }

  if (caller.role !== "owner") {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=unauthorized", req.url));
  }
  const verified = verifyOAuthState({ state, provider: "gcal", expectedUserId: caller.userId });
  if (!verified.ok || verified.tenantId !== caller.tenantId) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=invalid_state", req.url));
  }
  const stepUpDenied = await requireAal2OrResponse(supabase);
  if (stepUpDenied) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=step_up_required", req.url));
  }

  try {
    await exchangeCodeAndSave(code, verified.tenantId);
    return NextResponse.redirect(new URL("/admin/reservations?gcal=connected", req.url));
  } catch (e) {
    console.error("[gcal callback] token exchange failed:", e);
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=token_exchange", req.url));
  }
}
