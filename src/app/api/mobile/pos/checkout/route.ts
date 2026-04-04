import { NextRequest, NextResponse } from "next/server";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { VALID_PAYMENT_METHODS } from "@/types/pos-constants";
import { apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: POS会計処理（モバイルアプリ用 Bearer Token 認証） ───
export async function POST(req: NextRequest) {
  try {
    const { client, accessToken } = createMobileClient(req);
    if (!client) {
      return apiUnauthorized();
    }

    const caller = await resolveMobileCaller(client, accessToken);
    if (!caller) {
      return apiUnauthorized();
    }

    // staff以上のロールが必要
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    // Rate limiting: Upstash Redis ベース
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // amount は必須 + 範囲チェック
    const amount = parseInt(String(body?.amount ?? 0), 10);
    if (!amount || amount < 1 || amount > 999_999_999) {
      return apiValidationError("invalid_amount");
    }

    // tax_rate バリデーション (0-100)
    const taxRate = parseInt(String(body?.tax_rate ?? 10), 10);
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      return apiValidationError("invalid_tax_rate");
    }

    // payment_method バリデーション
    const paymentMethod = String(body?.payment_method ?? "cash");
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return apiValidationError("invalid_payment_method");
    }

    // RPC呼び出し
    const { data, error } = await client.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: (String(body?.reservation_id ?? "")).trim() || null,
      p_customer_id: (String(body?.customer_id ?? "")).trim() || null,
      p_store_id: (String(body?.store_id ?? "")).trim() || null,
      p_register_session_id: (String(body?.register_session_id ?? "")).trim() || null,
      p_payment_method: paymentMethod,
      p_amount: amount,
      p_received_amount: body?.received_amount != null
        ? parseInt(String(body.received_amount), 10)
        : null,
      p_items_json: body?.items_json ?? [],
      p_tax_rate: taxRate,
      p_note: (String(body?.note ?? "")).trim() || null,
      p_create_receipt: body?.create_receipt !== false,
      p_user_id: caller.userId,
    });

    if (error) {
      return apiInternalError(error, "mobile/pos/checkout");
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/checkout");
  }
}
