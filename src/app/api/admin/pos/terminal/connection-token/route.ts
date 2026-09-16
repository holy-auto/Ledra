
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";

export const dynamic = "force-dynamic";

// ─── POST: Stripe Terminal 接続トークン発行（Connect対応） ───
export const POST = withCaller(
  async (_req, { caller }) => {
    // Each call hits Stripe to mint a Terminal connection token. Tighter
    // limit (mobile_terminal preset, 30/min/IP) protects the Stripe API
    // from runaway clients but is generous enough for normal reader pairing.

    try {

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

      const token = await stripe.terminal.connectionTokens.create({}, stripeOptions);

      return apiJson({ secret: token.secret });
    } catch (e: unknown) {
      return apiInternalError(e, "pos/terminal/connection-token");
    }
  },
  { rateLimit: "mobile_terminal", minRole: "staff", routeName: "admin/pos/terminal/connection-token POST" },
);
