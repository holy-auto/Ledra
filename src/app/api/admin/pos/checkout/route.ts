import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posCheckoutSchema } from "@/lib/validations/pos";
import { deductInventoryForPosItems } from "@/lib/pos/inventoryDeduction";

export const dynamic = "force-dynamic";

// ─── POST: POS会計処理 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // staff以上のロールが必要
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // Rate limiting: 10 requests per 60 seconds per user
    const rlKey = `pos-checkout:${caller.userId || getClientIp(req)}`;
    const rl = await checkRateLimit(rlKey, { limit: 10, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
    }

    const parsed = posCheckoutSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const data2 = parsed.data;

    // RPC呼び出し
    const { admin: rpcAdmin } = createTenantScopedAdmin(caller.tenantId);
    // pos_checkout は SECURITY DEFINER で、引数の tenant_id をそのまま使う。
    // 未認証・他テナントから呼ばれないよう service_role 専用にしたので、
    // 権限確認済みのこのルートからはサービスロールのクライアントで呼ぶ
    const { data, error } = await rpcAdmin.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: data2.reservation_id,
      p_customer_id: data2.customer_id,
      p_store_id: data2.store_id,
      p_register_session_id: data2.register_session_id,
      p_payment_method: data2.payment_method,
      p_amount: data2.amount,
      p_received_amount: data2.received_amount ?? null,
      p_items_json: data2.items_json ?? [],
      p_tax_rate: data2.tax_rate,
      p_note: data2.note,
      p_create_receipt: data2.create_receipt !== false,
      p_user_id: caller.userId,
    });

    if (error) {
      return apiInternalError(error, "pos/checkout");
    }

    // 在庫紐付け商品があれば減算 (best-effort: 失敗してもレシートは確定)。
    // 失敗行は outbox `pos.inventory_deduction` に enqueue され、cron で再試行される。
    const result = data as { payment_id?: string | null } | null;
    const { admin: outboxAdmin } = createTenantScopedAdmin(caller.tenantId);
    const inventory = await deductInventoryForPosItems(supabase, data2.items_json, {
      tenantId: caller.tenantId,
      paymentId: result?.payment_id ?? null,
      outboxAdmin,
    });

    return apiJson({ ok: true, result: data, inventory });
  } catch (e: unknown) {
    return apiInternalError(e, "pos/checkout");
  }
}
