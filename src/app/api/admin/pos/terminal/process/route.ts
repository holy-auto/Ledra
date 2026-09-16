import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posTerminalProcessSchema } from "@/lib/validations/pos";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── POST: Terminal リーダーに PaymentIntent を送信（server-driven） ───
export const POST = withCaller(
  async (req, { caller }) => {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`terminal-process:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return apiJson({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
    }

    const parsed = posTerminalProcessSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { payment_intent_id: paymentIntentId, reader_id: readerId } = parsed.data;
    if (!paymentIntentId.startsWith("pi_")) return apiValidationError("invalid_payment_intent_id");
    if (!readerId.startsWith("tmr_")) return apiValidationError("invalid_reader_id");

    // テナントのStripe Connectアカウントを取得
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;

    const stripe = getStripeClient();

    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    // リーダーに PaymentIntent を送信
    const reader = await stripe.terminal.readers.processPaymentIntent(
      readerId,
      { payment_intent: paymentIntentId },
      stripeOptions,
    );

    return apiJson({ reader });
  },
  { minRole: "staff", routeName: "admin/pos/terminal/process POST" },
);
