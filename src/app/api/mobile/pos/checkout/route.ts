import { NextRequest, NextResponse } from "next/server";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { VALID_PAYMENT_METHODS } from "@/types/pos-constants";

export const dynamic = "force-dynamic";

// ─── POST: POS会計処理（モバイルアプリ用 Bearer Token 認証） ───
export async function POST(req: NextRequest) {
  try {
    const { client, accessToken } = createMobileClient(req);
    if (!client) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const caller = await resolveMobileCaller(client, accessToken);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // staff以上のロールが必要
    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Rate limiting: Upstash Redis ベース
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // amount は必須 + 範囲チェック
    const amount = parseInt(String(body?.amount ?? 0), 10);
    if (!amount || amount < 1 || amount > 999_999_999) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    // tax_rate バリデーション (0-100)
    const taxRate = parseInt(String(body?.tax_rate ?? 10), 10);
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      return NextResponse.json({ error: "invalid_tax_rate" }, { status: 400 });
    }

    // payment_method バリデーション
    const paymentMethod = String(body?.payment_method ?? "cash");
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 });
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
      console.error("[mobile/pos/checkout] rpc_error:", error.message);
      return NextResponse.json({ error: "checkout_failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e: unknown) {
    console.error("[mobile/pos/checkout] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
