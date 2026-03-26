import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: 返金処理 ───
export async function POST(req: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 返金はadmin以上のみ
    if (!requireMinRole(caller, "admin")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { id: paymentId } = await params;
    if (!paymentId) {
      return NextResponse.json({ error: "missing_payment_id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const refundAmount = parseInt(String(body?.refund_amount ?? 0), 10);
    if (!refundAmount || refundAmount <= 0) {
      return NextResponse.json({ error: "invalid_refund_amount" }, { status: 400 });
    }

    const reason = (String(body?.reason ?? "")).trim() || null;

    // 対象paymentを取得（tenant_id確認）
    const { data: payment, error: fetchErr } = await supabase
      .from("payments")
      .select("id, amount, status, reservation_id, refund_amount")
      .eq("id", paymentId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (fetchErr || !payment) {
      return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
    }

    // 既に返金済みの場合
    if (payment.status === "refunded") {
      return NextResponse.json({ error: "already_refunded" }, { status: 400 });
    }

    // 返金額が元の金額以下であることを確認
    if (refundAmount > (payment.amount ?? 0)) {
      return NextResponse.json({ error: "refund_exceeds_amount" }, { status: 400 });
    }

    // ステータス判定
    const newStatus =
      refundAmount === (payment.amount ?? 0) ? "refunded" : "partial_refund";

    // payment更新
    const { data: updated, error: updateErr } = await supabase
      .from("payments")
      .update({
        refund_amount: refundAmount,
        refund_reason: reason,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (updateErr) {
      console.error("[refund] update_failed:", updateErr.message);
      return NextResponse.json({ error: "refund_failed" }, { status: 500 });
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

    return NextResponse.json({ ok: true, payment: updated });
  } catch (e: unknown) {
    console.error("refund failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
