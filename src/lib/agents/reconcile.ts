import type Stripe from "stripe";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { recordSubscriptionCommission } from "./commission";

type Db = ReturnType<typeof createServiceRoleAdmin>;

function asStringId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "id" in v) return String((v as { id: unknown }).id);
  return String(v);
}

export type ReconcileResult = {
  referrals: number;
  scanned: number;
  created: number;
  skipped: number;
  errors: number;
};

/**
 * Safety-net reconciliation for agent commissions.
 *
 * The Stripe webhook (`invoice.paid`) is the primary generation path. If a
 * delivery was missed (webhook downtime, transient failure), this back-fills
 * the gap: for each `contracted` referral it pulls the tenant's recent PAID
 * subscription invoices from Stripe and re-runs the same idempotent generation
 * (`recordSubscriptionCommission`). Already-recorded invoices are skipped by
 * the `uq_agent_commissions_source_invoice` unique index, so re-runs are safe.
 *
 * Bounded by `lookbackDays` (invoice age) and `maxReferrals` (per run).
 */
export async function reconcileAgentCommissions(
  admin: Db,
  stripe: Stripe,
  opts: { lookbackDays?: number; maxReferrals?: number } = {},
): Promise<ReconcileResult> {
  const lookbackDays = opts.lookbackDays ?? 40;
  const maxReferrals = opts.maxReferrals ?? 500;
  const sinceUnix = Math.floor((Date.now() - lookbackDays * 86_400_000) / 1000);

  const { data: referrals } = await admin
    .from("agent_referrals")
    .select("id, tenant_id")
    .eq("status", "contracted")
    .not("tenant_id", "is", null)
    .limit(maxReferrals);

  const result: ReconcileResult = { referrals: 0, scanned: 0, created: 0, skipped: 0, errors: 0 };

  for (const ref of referrals ?? []) {
    const tenantId = ref.tenant_id as string;
    result.referrals++;

    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_subscription_id")
      .eq("id", tenantId)
      .maybeSingle();
    const subscriptionId = (tenant?.stripe_subscription_id as string | null | undefined) ?? null;
    if (!subscriptionId) {
      result.skipped++;
      continue;
    }

    let invoices: Stripe.Invoice[] = [];
    try {
      const list = await stripe.invoices.list({
        subscription: subscriptionId,
        status: "paid",
        created: { gte: sinceUnix },
        limit: 100,
      });
      invoices = list.data;
    } catch (e) {
      result.errors++;
      console.error("reconcile: stripe invoices.list failed", {
        tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    for (const inv of invoices) {
      const invRec = inv as unknown as Record<string, unknown>;
      const invSub = asStringId(invRec.subscription);
      if (!invSub || invSub !== subscriptionId) continue; // defensive: primary subscription only
      const amountPaid = (inv.amount_paid as number | undefined) ?? 0;
      if (amountPaid <= 0) continue;

      result.scanned++;
      try {
        const res = await recordSubscriptionCommission(admin, {
          tenantId,
          subscriptionId: invSub,
          invoiceId: inv.id as string,
          amountPaid,
          currency: inv.currency,
          periodStart: (invRec.period_start as number | undefined) ?? null,
          periodEnd: (invRec.period_end as number | undefined) ?? null,
        });
        if (res.status === "created") result.created++;
        else result.skipped++;
      } catch (e) {
        result.errors++;
        console.error("reconcile: recordSubscriptionCommission failed", {
          tenantId,
          invoiceId: inv.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return result;
}
