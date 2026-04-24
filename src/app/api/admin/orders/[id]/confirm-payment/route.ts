import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";

/**
 * POST /api/admin/orders/[id]/confirm-payment
 * 支払確認（双方が確認 → both_confirmed → completed）
 * Body: { payment_method?: string, amount?: number }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const body = await req.json().catch(() => ({}));

    // 注文取得
    const { data: order, error: fetchErr } = await admin
      .from("job_orders")
      .select(
        "id, status, from_tenant_id, to_tenant_id, payment_method, accepted_amount, payment_confirmed_by_client, payment_confirmed_by_vendor, payment_status",
      )
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (fetchErr || !order) {
      return apiNotFound("not_found");
    }

    if (!["payment_pending", "completed"].includes(order.status)) {
      return apiValidationError("支払確認は支払待ちまたは完了ステータスの注文のみ可能です");
    }

    const isFrom = order.from_tenant_id === tenantId;
    const isTo = order.to_tenant_id != null && order.to_tenant_id === tenantId;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // 支払方法・金額の記録（初回のみ）
    if (body.payment_method && !order.payment_method) {
      updateData.payment_method = body.payment_method;
    }
    if (body.amount && !order.accepted_amount) {
      updateData.accepted_amount = body.amount;
    }

    // 発注側（client）の確認
    if (isFrom && !order.payment_confirmed_by_client) {
      updateData.payment_confirmed_by_client = true;
    }
    // 受注側（vendor）の確認
    if (isTo && !order.payment_confirmed_by_vendor) {
      updateData.payment_confirmed_by_vendor = true;
    }

    // 双方確認済みかチェック
    const clientConfirmed = isFrom ? true : order.payment_confirmed_by_client;
    const vendorConfirmed = isTo ? true : order.payment_confirmed_by_vendor;

    if (clientConfirmed && vendorConfirmed) {
      updateData.payment_status = "both_confirmed";
      updateData.status = "completed";
    } else if (isFrom) {
      updateData.payment_status = "confirmed_by_client";
    } else if (isTo) {
      updateData.payment_status = "confirmed_by_vendor";
    }

    const { data, error } = await admin
      .from("job_orders")
      .update(updateData)
      .eq("id", id)
      .select(
        "id, public_id, from_tenant_id, to_tenant_id, title, status, payment_status, payment_method, accepted_amount, payment_confirmed_by_client, payment_confirmed_by_vendor, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "confirm-payment update");
    }

    // 監査ログ
    admin
      .from("order_audit_log")
      .insert({
        job_order_id: id,
        actor_user_id: caller.userId,
        actor_tenant_id: tenantId,
        action: "payment_confirmed",
        old_value: { payment_status: order.payment_status },
        new_value: { payment_status: updateData.payment_status ?? order.payment_status },
      })
      .then(() => {}, console.error);

    return apiJson({ ok: true, order: data });
  } catch (e: unknown) {
    return apiInternalError(e, "confirm-payment POST");
  }
}
