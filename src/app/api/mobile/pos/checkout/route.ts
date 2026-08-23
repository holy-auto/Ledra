import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posCheckoutSchema } from "@/lib/validations/pos";
import { deductInventoryForPosItems } from "@/lib/pos/inventoryDeduction";

export const dynamic = "force-dynamic";

// ─── POST: POS会計処理（モバイルアプリ用 Bearer Token 認証） ───
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) {
      return apiUnauthorized();
    }
    const client = caller.supabase;

    // staff以上のロールが必要
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    // Rate limiting: Upstash Redis ベース
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const parsed = posCheckoutSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const { admin: rpcAdmin } = createTenantScopedAdmin(caller.tenantId);
    // pos_checkout は SECURITY DEFINER で、引数の tenant_id をそのまま使う。
    // 未認証・他テナントから呼ばれないよう service_role 専用にしたので、
    // 権限確認済みのこのルートからはサービスロールのクライアントで呼ぶ
    const { data, error } = await rpcAdmin.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: input.reservation_id,
      p_customer_id: input.customer_id,
      p_store_id: input.store_id,
      p_register_session_id: input.register_session_id,
      p_payment_method: input.payment_method,
      p_amount: input.amount,
      p_received_amount: input.received_amount ?? null,
      p_items_json: input.items_json ?? [],
      p_tax_rate: input.tax_rate,
      p_note: input.note,
      p_create_receipt: input.create_receipt !== false,
      p_user_id: caller.userId,
    });

    if (error) {
      return apiInternalError(error, "mobile/pos/checkout");
    }

    // 在庫紐付け商品があれば減算 (best-effort + outbox リトライ)
    const result = data as { payment_id?: string | null } | null;
    const { admin: outboxAdmin } = createTenantScopedAdmin(caller.tenantId);
    const inventory = await deductInventoryForPosItems(client, input.items_json, {
      tenantId: caller.tenantId,
      paymentId: result?.payment_id ?? null,
      outboxAdmin,
    });

    return apiJson({ ok: true, result: data, inventory });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/checkout");
  }
}
