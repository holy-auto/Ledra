import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const paymentRefundSchema = z.object({
  refund_amount: z.coerce.number().int().positive("invalid_refund_amount"),
  reason: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

// ─── POST: 返金処理 ───
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }

    // 返金はadmin以上のみ
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden();
    }

    const { id: paymentId } = await params;
    if (!paymentId) {
      return apiValidationError("missing_payment_id");
    }

    const parsed = paymentRefundSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { refund_amount: refundAmount, reason } = parsed.data;

    // 対象paymentを取得（tenant_id確認）
    const { data: payment, error: fetchErr } = await supabase
      .from("payments")
      .select("id, amount, status, reservation_id, refund_amount")
      .eq("id", paymentId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (fetchErr || !payment) {
      return apiNotFound("payment_not_found");
    }

    // 既に返金済みの場合
    if (payment.status === "refunded") {
      return apiValidationError("already_refunded");
    }

    // 返金は累計で管理する。既存の返金額に今回分を足し、元金額を超えないか検証する
    // （単発額だけで比較すると partial_refund から再返金して合計が元金額を超えてしまう）。
    const alreadyRefunded = Number(payment.refund_amount ?? 0);
    const grossAmount = Number(payment.amount ?? 0);
    const cumulativeRefund = alreadyRefunded + refundAmount;
    if (cumulativeRefund > grossAmount) {
      return apiValidationError("refund_exceeds_amount");
    }

    // ステータス判定（累計が元金額に達したら全額返金）
    const newStatus = cumulativeRefund === grossAmount ? "refunded" : "partial_refund";

    // payment更新（refund_amount は累計で保存する）
    const { data: updated, error: updateErr } = await supabase
      .from("payments")
      .update({
        refund_amount: cumulativeRefund,
        refund_reason: reason,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, store_id, document_id, reservation_id, customer_id, payment_method, amount, status, refund_amount, refund_reason, paid_at, created_at, updated_at",
      )
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "refund update");
    }

    // 予約がある場合、payment_statusを更新
    if (payment.reservation_id) {
      const { error: resErr } = await supabase
        .from("reservations")
        .update({
          payment_status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.reservation_id)
        .eq("tenant_id", caller.tenantId);

      if (resErr) {
        console.error("[refund] reservation_update_failed:", resErr.message);
        // 返金自体は成功しているので、ここではエラーを返さない
      }
    }

    return apiJson({ ok: true, payment: updated });
  } catch (e: unknown) {
    return apiInternalError(e, "refund POST");
  }
}
