import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { getStripeClient } from "@/lib/stripe/client";
import { reconcileAgentCommissions } from "@/lib/agents/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Agent commission reconciliation cron — weekly safety net.
 *
 * The Stripe webhook (invoice.paid) generates commissions in real time. This
 * cron back-fills any subscription invoice from the last ~40 days that did NOT
 * produce a commission (e.g. a missed webhook delivery). Generation is
 * idempotent (uq_agent_commissions_source_invoice), so re-runs never duplicate.
 *
 * vercel.json: "15 4 * * 1" (Mondays 04:15 UTC).
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const supabase = createServiceRoleAdmin(
      "cron:agent-commissions-reconcile — scans contracted referrals across every tenant",
    );
    const stripe = getStripeClient();

    const lock = await withCronLock(supabase, "agent-commissions-reconcile", 600, () =>
      reconcileAgentCommissions(supabase, stripe),
    );

    if (!lock.acquired) {
      return apiOk({ skipped: "lock-held" });
    }
    return apiOk({ ...lock.value });
  } catch (e) {
    await sendCronFailureAlert("agent-commissions-reconcile", e);
    return apiInternalError(e, "agent-commissions-reconcile cron");
  }
}
