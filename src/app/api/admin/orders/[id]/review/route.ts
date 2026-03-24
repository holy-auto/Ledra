import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

/**
 * POST /api/admin/orders/[id]/review
 * 取引完了後の評価送信
 * Body: { rating: 1-5, comment?: string }
 * 双方が送信後に自動公開（DB trigger で published_at をセット）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const body = await req.json();
    const { rating, comment } = body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating は 1〜5 の整数で指定してください" }, { status: 400 });
    }

    // 注文取得
    const { data: order } = await supabase
      .from("job_orders")
      .select("id, from_tenant_id, to_tenant_id, status")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (!order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (order.status !== "completed") {
      return NextResponse.json({ error: "完了済みの取引のみ評価可能です" }, { status: 400 });
    }

    // reviewer / reviewed を特定
    const isFrom = order.from_tenant_id === tenantId;
    const reviewerTenantId = tenantId;
    const reviewedTenantId = isFrom ? order.to_tenant_id : order.from_tenant_id;

    // 重複チェック
    const { data: existing } = await supabase
      .from("order_reviews")
      .select("id")
      .eq("job_order_id", id)
      .eq("reviewer_tenant_id", reviewerTenantId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "この取引への評価は既に送信済みです" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("order_reviews")
      .insert({
        job_order_id: id,
        reviewer_tenant_id: reviewerTenantId,
        reviewed_tenant_id: reviewedTenantId,
        rating: Math.round(rating),
        comment: comment?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[review] insert failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    // パートナースコア更新（fire-and-forget）
    supabase.rpc("refresh_partner_score", { p_tenant_id: reviewedTenantId }).then(() => {});

    // 監査ログ
    supabase
      .from("order_audit_log")
      .insert({
        job_order_id: id,
        actor_user_id: caller.userId,
        actor_tenant_id: tenantId,
        action: "review_submitted",
        new_value: { rating: Math.round(rating), reviewed_tenant_id: reviewedTenantId },
      })
      .then(() => {});

    return NextResponse.json({ review: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[review] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
