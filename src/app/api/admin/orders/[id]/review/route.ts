import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";

const orderReviewCreateSchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1, "rating は 1〜5 の整数で指定してください")
    .max(5, "rating は 1〜5 の整数で指定してください"),
  comment: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

/**
 * POST /api/admin/orders/[id]/review
 * 取引完了後の評価送信
 * Body: { rating: 1-5, comment?: string }
 * 双方が送信後に自動公開（DB trigger で published_at をセット）
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const parsed = orderReviewCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { rating, comment } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 注文取得
    const { data: order } = await admin
      .from("job_orders")
      .select("id, from_tenant_id, to_tenant_id, status")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (!order) {
      return apiNotFound("not_found");
    }

    if (order.status !== "completed") {
      return apiValidationError("完了済みの取引のみ評価可能です");
    }

    if (!order.to_tenant_id) {
      return apiValidationError("受注者が未確定のため評価できません");
    }

    // reviewer / reviewed を特定
    const isFrom = order.from_tenant_id === tenantId;
    const reviewerTenantId = tenantId;
    const reviewedTenantId = isFrom ? order.to_tenant_id : order.from_tenant_id;

    // 重複チェック
    const { data: existing } = await admin
      .from("order_reviews")
      .select("id")
      .eq("job_order_id", id)
      .eq("reviewer_tenant_id", reviewerTenantId)
      .maybeSingle();

    if (existing) {
      return apiJson({ error: "conflict", message: "この取引への評価は既に送信済みです" }, { status: 409 });
    }

    const { data, error } = await admin
      .from("order_reviews")
      .insert({
        job_order_id: id,
        reviewer_tenant_id: reviewerTenantId,
        reviewed_tenant_id: reviewedTenantId,
        rating,
        comment,
      })
      .select(
        "id, job_order_id, reviewer_tenant_id, reviewed_tenant_id, rating, comment, published_at, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "review insert");
    }

    // パートナースコア更新（fire-and-forget）
    admin.rpc("refresh_partner_score", { p_tenant_id: reviewedTenantId }).then(() => {}, console.error);

    // 監査ログ
    admin
      .from("order_audit_log")
      .insert({
        job_order_id: id,
        actor_user_id: caller.userId,
        actor_tenant_id: tenantId,
        action: "review_submitted",
        new_value: { rating, reviewed_tenant_id: reviewedTenantId },
      })
      .then(() => {}, console.error);

    return apiJson({ review: data }, { status: 201 });
  } catch (e: unknown) {
    return apiInternalError(e, "review POST");
  }
}
