import { getStripeClient } from "@/lib/stripe/client";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createServiceRoleAdmin>;

export type PayoutResult = { ok: boolean; reason?: string; transferId?: string };

/**
 * Pay out a single approved agent commission via Stripe Connect.
 *
 * The transfer carries `metadata.source_type=commission` + `source_id`, which
 * the connect-webhook (`transfer.paid` / `transfer.reversed`) uses to flip the
 * commission to `paid` / `failed`. We therefore leave the status at `approved`
 * here and only stamp `stripe_transfer_id` — the webhook confirms settlement.
 *
 * Human-approved by design (壁3): callers must have already moved the
 * commission to `approved`. Idempotent via the Stripe idempotency key and the
 * stored `stripe_transfer_id`.
 */
export async function payAgentCommission(admin: Db, commissionId: string): Promise<PayoutResult> {
  const { data: commission } = await admin
    .from("agent_commissions")
    .select("id, agent_id, amount, currency, status, stripe_transfer_id")
    .eq("id", commissionId)
    .maybeSingle();

  if (!commission) return { ok: false, reason: "not_found" };
  if (commission.status === "paid") {
    return { ok: true, transferId: (commission.stripe_transfer_id as string | null) ?? undefined };
  }
  if (commission.stripe_transfer_id) {
    // Already dispatched; webhook will settle it.
    return { ok: true, transferId: commission.stripe_transfer_id as string };
  }
  if (commission.status !== "approved") return { ok: false, reason: "not_approved" };
  if (!commission.amount || commission.amount <= 0) return { ok: false, reason: "zero_amount" };

  const { data: agent } = await admin
    .from("agents")
    .select("id, stripe_account_id, stripe_onboarding_done")
    .eq("id", commission.agent_id)
    .maybeSingle();
  if (!agent?.stripe_account_id || !agent.stripe_onboarding_done) {
    return { ok: false, reason: "agent_not_onboarded" };
  }

  const stripe = getStripeClient();
  const transfer = await stripe.transfers.create(
    {
      amount: Math.round(commission.amount as number),
      currency: ((commission.currency as string | null) || "jpy").toLowerCase(),
      destination: agent.stripe_account_id as string,
      metadata: {
        source_type: "commission",
        source_id: commissionId,
        fee_amount: "0",
      },
    },
    { idempotencyKey: `commission-payout:${commissionId}` },
  );

  await admin
    .from("agent_commissions")
    .update({ stripe_transfer_id: transfer.id, updated_at: new Date().toISOString() })
    .eq("id", commissionId);

  return { ok: true, transferId: transfer.id };
}
