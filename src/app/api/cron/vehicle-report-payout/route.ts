import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { settleApprovedRevenueShares } from "@/lib/vehicleReport/payout";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vehicle-report revenue-share settlement cron.
 *
 * Pays out every `approved` share (to onboarded施工店) via Stripe Connect and
 * lets the connect-webhook confirm settlement. Approval is a human gate
 * (platform admin) — nothing is paid until a share is moved pending→approved,
 * so this cron never moves money on its own before sign-off. Idempotent: the
 * per-share Stripe idempotency key + stored transfer id make re-runs safe.
 *
 * vercel.json: "20 5 * * *" (daily 05:20 UTC).
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const admin = createServiceRoleAdmin(
      "cron:vehicle-report-payout — settle approved report revenue shares across every tenant",
    );

    const lock = await withCronLock(admin, "vehicle-report-payout", 600, () => settleApprovedRevenueShares(admin));

    if (!lock.acquired) {
      return apiOk({ skipped: "lock-held" });
    }
    return apiOk({ ...lock.value });
  } catch (e) {
    await sendCronFailureAlert("vehicle-report-payout", e);
    return apiInternalError(e, "vehicle-report-payout cron");
  }
}
