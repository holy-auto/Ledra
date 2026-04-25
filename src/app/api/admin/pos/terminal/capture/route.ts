import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { posTerminalCaptureSchema } from "@/lib/validations/pos-capture";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 決済確認 + POS会計記録（Connect対応） ───
export async function POST(req: NextRequest) {
  // Each call retrieves a Stripe PaymentIntent and writes to pos_checkout.
  // mobile_pos preset (10/min/IP) matches the equivalent mobile route and
  // bounds replay if a session leaks.
  const limited = await checkRateLimit(req, "mobile_pos");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = posTerminalCaptureSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const data2 = parsed.data;
    if (!data2.payment_intent_id.startsWith("pi_")) {
      return apiValidationError("invalid_payment_intent_id");
    }
    const paymentIntentId = data2.payment_intent_id;

    // テナントのStripe Connectアカウントを取得
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
    });

    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    // PaymentIntent のステータス確認（Connectアカウント対応）
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, stripeOptions);

    if (pi.status !== "succeeded") {
      return apiValidationError(`payment_not_succeeded: status is "${pi.status}"`);
    }

    // pos_checkout RPC で支払記録 + 領収書作成
    const { data, error } = await supabase.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: data2.reservation_id,
      p_customer_id: data2.customer_id,
      p_store_id: data2.store_id,
      p_register_session_id: data2.register_session_id,
      p_payment_method: "card",
      p_amount: pi.amount,
      p_received_amount: pi.amount,
      p_items_json: data2.items_json ?? [],
      p_tax_rate: data2.tax_rate,
      p_note: data2.note,
      p_create_receipt: true,
      p_user_id: caller.userId,
    });

    if (error) {
      return apiInternalError(error, "pos/terminal/capture");
    }

    return apiJson({
      ok: true,
      payment_intent_id: pi.id,
      amount: pi.amount,
      status: pi.status,
      result: data,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "pos/terminal/capture");
  }
}
