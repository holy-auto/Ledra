import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * GET /s/v/<publicId>
 *
 * 車両タグ (NFC / QR) をかざしたスタッフの作業開始入口。tag には内部 UUID では
 * なく vehicles.public_id ('veh_...') を焼く。ログイン済み施工店スタッフのみが
 * 自テナントの車両を解決でき、車両詳細ページの作業開始パネル
 * (?start=1) へ転送する。
 *
 * - 未ログイン: /login?next=/s/v/<publicId> へ (認証後に戻ってくる)。
 * - 他テナントの車両 / 不明な public_id: 404 (どの ID が有効かを漏らさない)。
 *
 * テナント分離は tenant_memberships のスコープ + クエリの tenant_id 一致 +
 * RLS の三重で担保する (admin/vehicles/[id] と同じ作法)。
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { publicId } = await ctx.params;
  const origin = req.nextUrl.origin;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/s/v/${encodeURIComponent(publicId)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin));
  }

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("tenant_id", membership.tenant_id)
    .eq("public_id", publicId)
    .maybeSingle();

  if (!vehicle?.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(new URL(`/admin/vehicles/${vehicle.id}?start=1`, origin));
}
