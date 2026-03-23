import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: POS会計処理 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // staff以上のロールが必要
    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Rate limiting: 10 requests per 60 seconds per user
    const rlKey = `pos-checkout:${caller.userId || getClientIp(req)}`;
    const rl = checkRateLimit(rlKey, { limit: 10, windowSec: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retry_after: rl.retryAfterSec },
        { status: 429 },
      );
    }

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
    const validMethods = ["cash", "card", "qr", "bank_transfer", "other"];
    const paymentMethod = String(body?.payment_method ?? "cash");
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 });
    }

    // RPC呼び出し
    const { data, error } = await supabase.rpc("pos_checkout", {
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
      console.error("[pos/checkout] rpc_error:", error.message);
      return NextResponse.json({ error: "checkout_failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e: unknown) {
    console.error("pos checkout failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
