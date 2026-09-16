
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { z } from "zod";

import { withCaller } from "@/lib/api/withCaller";
const terminalPiSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  currency: z.string().trim().min(1).max(10).default("jpy"),
  description: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal PaymentIntent 作成（Connect対応） ───
export const POST = withCaller(
  async (req, { caller }) => {
    try {
      // Rate limiting
      const ip = getClientIp(req);
      const rl = await checkRateLimit(`terminal-pi:${ip}`, { limit: 30, windowSec: 60 });
      if (!rl.allowed) {
        return apiJson({ error: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429 });
      }

      const parsed = terminalPiSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { amount, currency, description, metadata: extraMetadata = {} } = parsed.data;

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

      // Connectアカウントがある場合はそちらでPaymentIntentを作成
      const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount,
          currency,
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          ...(description ? { description } : {}),
          metadata: {
            tenant_id: caller.tenantId,
            user_id: caller.userId,
            ...extraMetadata,
          },
        },
        { ...stripeOptions, idempotencyKey: crypto.randomUUID() },
      );

      return apiJson({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        connect_account: connectAccountId && isOnboarded ? connectAccountId : null,
      });
    } catch (e: unknown) {
      return apiInternalError(e, "pos/terminal/create-payment-intent");
    }
  },
  { minRole: "staff", routeName: "admin/pos/terminal/create-payment-intent POST" },
);

// ─── GET: PaymentIntent ステータス確認（ポーリング用） ───
export const GET = withCaller(
  async (req, { caller }) => {
    try {

      const id = req.nextUrl.searchParams.get("id");
      if (!id || !id.startsWith("pi_")) {
        return apiValidationError("invalid_id");
      }

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

      const pi = await stripe.paymentIntents.retrieve(id, stripeOptions);

      // tenant_id チェック（自テナントのPIのみ参照可能）
      if (pi.metadata?.tenant_id !== caller.tenantId) {
        return apiNotFound("not_found");
      }

      return apiJson({
        id: pi.id,
        status: pi.status,
        amount: pi.amount,
      });
    } catch (e: unknown) {
      return apiInternalError(e, "pos/terminal/create-payment-intent GET");
    }
  },
  { minRole: "staff", routeName: "admin/pos/terminal/create-payment-intent GET" },
);
