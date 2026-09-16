import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── GET: Stripe Terminal リーダー一覧取得（Connect対応） ───
export const GET = withCaller(
  async (_req, { caller }) => {
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

      const list = await stripe.terminal.readers.list({ limit: 100 }, stripeOptions);

      // テナントごとにフィルタ（metadata.tenant_id が設定されている場合）
      const readers = list.data
        .filter((r) => {
          const meta = r.metadata ?? {};
          // metadata にtenant_idが未設定のリーダーも含める（共有リーダー対応）
          return !meta.tenant_id || meta.tenant_id === caller.tenantId;
        })
        .map((r) => ({
          id: r.id,
          label: r.label ?? r.id,
          status: r.status,
          device_type: r.device_type,
          location: r.location ?? null,
        }));

      return apiJson({ readers });
    } catch (e: unknown) {
      return apiInternalError(e, "pos/terminal/readers");
    }
  },
  { minRole: "staff", routeName: "admin/pos/terminal/readers GET" },
);
