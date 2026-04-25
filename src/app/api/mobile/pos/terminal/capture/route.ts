import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posTerminalCaptureSchema } from "@/lib/validations/pos";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 決済確認 + POS会計記録（モバイルアプリ用） ───
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const limited = await checkRateLimit(req, "mobile_pos");
    if (limited) return limited;

    const { client, accessToken } = createMobileClient(req);
    if (!client) {
      return apiUnauthorized();
    }

    const caller = await resolveMobileCaller(client, accessToken);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    const parsed = posTerminalCaptureSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;
    const paymentIntentId = input.payment_intent_id;

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
      return apiValidationError(`PaymentIntent status is "${pi.status}", expected "succeeded"`);
    }

    // pos_checkout RPC で支払記録 + 領収書作成
    const { data, error } = await client.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: input.reservation_id,
      p_customer_id: input.customer_id,
      p_store_id: input.store_id,
      p_register_session_id: input.register_session_id,
      p_payment_method: "card",
      p_amount: pi.amount,
      p_received_amount: pi.amount,
      p_items_json: input.items_json ?? [],
      p_tax_rate: input.tax_rate,
      p_note: input.note,
      p_create_receipt: true,
      p_user_id: caller.userId,
    });

    if (error) {
      return apiInternalError(error, "mobile/pos/terminal/capture");
    }

    return apiJson({
      ok: true,
      payment_intent_id: pi.id,
      amount: pi.amount,
      status: pi.status,
      result: data,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/terminal/capture");
  }
}
