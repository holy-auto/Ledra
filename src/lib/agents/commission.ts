import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import type { CommissionType, ReferralStatus } from "@/types/agent";

type Db = ReturnType<typeof createServiceRoleAdmin>;

/**
 * Referral states from which a *paying* tenant is auto-advanced to
 * "contracted". Terminal states (cancelled/churned) and "contracted" itself
 * are left untouched.
 */
export const PRECONTRACT_STATUSES: ReferralStatus[] = ["pending", "contacted", "in_negotiation", "trial"];

/**
 * Commission amount in the smallest currency unit (yen for JPY).
 *
 * - percentage: base × rate% (rounded to the nearest yen)
 * - fixed:      flat amount, independent of base
 */
export function computeCommissionAmount(params: {
  baseAmount: number;
  rate: number;
  type: CommissionType;
  fixed: number;
}): number {
  const { baseAmount, rate, type, fixed } = params;
  if (type === "fixed") return Math.max(0, Math.round(fixed));
  if (baseAmount <= 0 || rate <= 0) return 0;
  return Math.max(0, Math.round((baseAmount * rate) / 100));
}

type ReferralWithAgent = {
  id: string;
  agent_id: string;
  status: string;
  commission_rate: number | null;
  commission_type: string | null;
  commission_fixed: number | null;
  agents: {
    status: string;
    default_commission_rate: number;
    commission_type: string;
    default_commission_fixed: number;
  } | null;
};

/** Most recent non-terminal referral for a tenant, with its agent's defaults. */
async function findActiveReferral(admin: Db, tenantId: string): Promise<ReferralWithAgent | null> {
  const { data } = await admin
    .from("agent_referrals")
    .select(
      "id, agent_id, status, commission_rate, commission_type, commission_fixed, " +
        "agents!inner(status, default_commission_rate, commission_type, default_commission_fixed)",
    )
    .eq("tenant_id", tenantId)
    .not("status", "in", "(cancelled,churned)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  // PostgREST returns a to-one embed as an object; normalise if it arrives as an array.
  const raw = data as unknown as Record<string, unknown>;
  const agentEmbed = Array.isArray(raw.agents) ? raw.agents[0] : raw.agents;
  return { ...(raw as unknown as ReferralWithAgent), agents: (agentEmbed as ReferralWithAgent["agents"]) ?? null };
}

/**
 * Advance a tenant's referral to "contracted" once they start paying.
 * No-op when there is no referral or it is already past the pre-contract
 * stage. Idempotent and race-guarded.
 */
export async function advanceReferralToContracted(admin: Db, tenantId: string): Promise<void> {
  const ref = await findActiveReferral(admin, tenantId);
  if (!ref) return;
  if (!PRECONTRACT_STATUSES.includes(ref.status as ReferralStatus)) return;

  await admin
    .from("agent_referrals")
    .update({
      status: "contracted",
      contracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ref.id)
    .in("status", PRECONTRACT_STATUSES);
}

export type CommissionResult = {
  status: "created" | "skipped";
  reason?: string;
  commissionId?: string;
  amount?: number;
};

/**
 * Generate a pending commission from a paid Stripe subscription invoice.
 *
 * Triggered from the Stripe webhook on `invoice.paid`. The commission base
 * is the *actual amount charged* (invoice.amount_paid), so discounts /
 * proration / annual billing flow through automatically. Idempotent per
 * Stripe invoice id (uq_agent_commissions_source_invoice).
 *
 * Guardrails:
 *  - only the tenant's PRIMARY plan subscription counts (add-on / template
 *    option subscriptions are ignored — they live in tenant_option_subscriptions)
 *  - auto-advances the referral to "contracted" on first payment
 *  - suspended agents and zero-amount invoices are skipped
 *  - payout itself stays human-approved (壁3) — this only creates `pending`
 */
export async function recordSubscriptionCommission(
  admin: Db,
  params: {
    tenantId: string;
    subscriptionId: string;
    invoiceId: string;
    amountPaid: number;
    currency?: string | null;
    periodStart: number | null;
    periodEnd: number | null;
  },
): Promise<CommissionResult> {
  const { tenantId, subscriptionId, invoiceId, amountPaid } = params;

  // Only the tenant's main plan subscription generates commission.
  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_subscription_id, plan_tier")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return { status: "skipped", reason: "tenant_not_found" };
  if (tenant.stripe_subscription_id && tenant.stripe_subscription_id !== subscriptionId) {
    return { status: "skipped", reason: "not_primary_subscription" };
  }

  // First paid invoice promotes the referral to contracted.
  await advanceReferralToContracted(admin, tenantId);

  const ref = await findActiveReferral(admin, tenantId);
  if (!ref) return { status: "skipped", reason: "no_referral" };
  if (ref.status !== "contracted") return { status: "skipped", reason: `referral_${ref.status}` };
  if (ref.agents?.status === "suspended") return { status: "skipped", reason: "agent_suspended" };
  if (amountPaid <= 0) return { status: "skipped", reason: "zero_amount" };

  const agent = ref.agents;
  const type = (ref.commission_type ?? agent?.commission_type ?? "percentage") as CommissionType;
  const rate = Number(ref.commission_rate ?? agent?.default_commission_rate ?? 0);
  const fixed = Number(ref.commission_fixed ?? agent?.default_commission_fixed ?? 0);
  const amount = computeCommissionAmount({ baseAmount: amountPaid, rate, type, fixed });
  if (amount <= 0) return { status: "skipped", reason: "zero_commission" };

  const toDate = (s: number | null): string => (s ? new Date(s * 1000) : new Date()).toISOString().slice(0, 10);

  const { data: inserted, error } = await admin
    .from("agent_commissions")
    .upsert(
      {
        agent_id: ref.agent_id,
        referral_id: ref.id,
        tenant_id: tenantId,
        period_start: toDate(params.periodStart),
        period_end: toDate(params.periodEnd),
        base_amount: Math.round(amountPaid),
        commission_rate: rate,
        commission_type: type,
        amount,
        currency: (params.currency ?? "jpy").toLowerCase(),
        status: "pending",
        source_invoice_id: invoiceId,
      },
      { onConflict: "source_invoice_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) return { status: "skipped", reason: `db_error:${error.code ?? "unknown"}` };
  if (!inserted) return { status: "skipped", reason: "duplicate" };
  return { status: "created", commissionId: inserted.id as string, amount };
}
