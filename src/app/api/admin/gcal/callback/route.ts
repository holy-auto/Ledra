import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndSave } from "@/lib/gcal/client";
import { createClient } from "@/lib/supabase/server";

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

  // ── 認証チェック: ユーザーがログイン済みかつテナントメンバーであることを確認 ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=unauthenticated", req.url));
  }

  // ユーザーが拒否した場合
  if (error) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=denied", req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=missing_params", req.url));
  }

  // ユーザーが対象テナントのメンバーであるか確認
  const { admin } = createTenantScopedAdmin(state);
  const { data: membership } = await admin
    .from("tenant_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", state)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=unauthorized", req.url));
  }

  try {
    await exchangeCodeAndSave(code, state);
    return NextResponse.redirect(new URL("/admin/reservations?gcal=connected", req.url));
  } catch (e) {
    console.error("[gcal callback] token exchange failed:", e);
    return NextResponse.redirect(new URL("/admin/reservations?gcal=error&reason=token_exchange", req.url));
  }
}
