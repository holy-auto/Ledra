/**
 * GET /api/cron/passport-meta-anchor-retry
 *
 * Sweep for `vehicle_passports` rows where we computed and persisted a
 * `meta_anchor_hash` but Polygon anchoring failed at the time
 * (`meta_anchor_tx_hash IS NULL`), and retry the anchor. The hash hasn't
 * changed since the failure, so calling `recomputeAndMaybeAnchor` is
 * naturally idempotent — it will detect the unchanged hash and re-attempt
 * the Polygon write only because the tx column is still null.
 *
 * In normal operation the queue is empty: meta-anchors succeed inline in
 * `upsertVehiclePassport`. This cron is the safety net for transient RPC
 * outages, signer-balance dips, and the deploy window during a network
 * cutover (Amoy → mainnet).
 *
 * Scheduled hourly via vercel.json; pairs with `polygon-signer` (which
 * monitors signer balance) so a low-balance situation surfaces in alerts
 * before this cron stops being able to drain the backlog.
 */
import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { retryAnchorForPendingPassport } from "@/lib/passport/metaAnchor";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cap per-run work to bound the worst-case signer cost from a one-time
// outage backlog. With ~$0.001/tx on mainnet, 50 retries = ~$0.05.
const MAX_RETRIES_PER_RUN = 50;

export async function GET(req: NextRequest) {
  const { authorized } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized();

  const admin = createServiceRoleAdmin("passport-meta-anchor-retry cron — drain failed PR-7 anchors");

  const lockResult = await withCronLock(admin, "passport-meta-anchor-retry", 600, async () => {
    const { data: pendingRaw, error } = await admin
      .from("vehicle_passports")
      .select("vin_code_normalized, meta_anchor_hash, last_activity_at")
      .is("meta_anchor_tx_hash", null)
      .not("meta_anchor_hash", "is", null)
      .order("last_activity_at", { ascending: true }) // oldest backlog first
      .limit(MAX_RETRIES_PER_RUN);

    if (error) {
      throw new Error(`pending lookup failed: ${error.message}`);
    }

    const pending = (pendingRaw ?? []) as { vin_code_normalized: string; meta_anchor_hash: string | null }[];

    let anchored = 0;
    let stillFailed = 0;
    let raced = 0;
    const failures: { vin: string; reason: string }[] = [];

    for (const row of pending) {
      try {
        const res = await retryAnchorForPendingPassport(admin, row.vin_code_normalized);
        if (res.status === "anchored") {
          anchored += 1;
        } else if (res.status === "anchor_failed") {
          stillFailed += 1;
          failures.push({ vin: row.vin_code_normalized.slice(-6), reason: "polygon_disabled_or_error" });
        } else {
          // already_anchored / no_pending_hash — upsertVehiclePassport
          // ran in parallel or the row was opted out. Skip.
          raced += 1;
        }
      } catch (e) {
        stillFailed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ vin: row.vin_code_normalized.slice(-6), reason: msg.slice(0, 200) });
        logger.warn("[meta-anchor-retry] threw", { vin: row.vin_code_normalized.slice(-6), error: msg });
      }
    }

    return apiJson({
      ok: true,
      scanned: pending.length,
      anchored,
      still_failed: stillFailed,
      raced,
      failures: failures.slice(0, 10), // cap the response size; the rest is in logs
    });
  }).catch((e) => apiInternalError(e, "passport-meta-anchor-retry cron"));

  if ("acquired" in lockResult && !lockResult.acquired) {
    return apiJson({ ok: true, skipped: "lock-held" });
  }
  if ("value" in lockResult) {
    return lockResult.value as ReturnType<typeof apiJson>;
  }
  return lockResult;
}
