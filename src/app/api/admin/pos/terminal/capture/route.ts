import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 決済確認 + POS会計記録（Connect対応） ───
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const paymentIntentId = String(body?.payment_intent_id ?? "").trim();
    if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
      return NextResponse.json({ error: "invalid_payment_intent_id" }, { status: 400 });
    }

    // テナントのStripe Connectアカウントを取得
    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    const stripeOptions = connectAccountId && isOnboarded
      ? { stripeAccount: connectAccountId }
      : undefined;

    // PaymentIntent のステータス確認（Connectアカウント対応）
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, stripeOptions);

    if (pi.status !== "succeeded") {
      return NextResponse.json(
        {
          error: "payment_not_succeeded",
          detail: `PaymentIntent status is "${pi.status}"`,
        },
        { status: 400 },
      );
    }

    // pos_checkout RPC で支払記録 + 領収書作成
    const { data, error } = await supabase.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: (String(body?.reservation_id ?? "")).trim() || null,
      p_customer_id: (String(body?.customer_id ?? "")).trim() || null,
      p_store_id: (String(body?.store_id ?? "")).trim() || null,
      p_register_session_id: (String(body?.register_session_id ?? "")).trim() || null,
      p_payment_method: "card",
      p_amount: pi.amount,
      p_received_amount: pi.amount,
      p_items_json: body?.items_json ?? [],
      p_tax_rate: parseInt(String(body?.tax_rate ?? 10), 10),
      p_note: (String(body?.note ?? "")).trim() || null,
      p_create_receipt: true,
      p_user_id: caller.userId,
    });

    if (error) {
      console.error("[pos/terminal/capture] rpc_error:", error.message);
      return NextResponse.json(
        { error: "checkout_failed", detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      payment_intent_id: pi.id,
      amount: pi.amount,
      status: pi.status,
      result: data,
    });
  } catch (e: unknown) {
    console.error("[pos/terminal/capture] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
