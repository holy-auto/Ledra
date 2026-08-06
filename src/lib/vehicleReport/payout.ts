import { getStripeClient } from "@/lib/stripe/client";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

type Db = ReturnType<typeof createServiceRoleAdmin>;

export type PayoutResult = { ok: boolean; reason?: string; transferId?: string };

/**
 * What to do with one revenue-share row when its underlying report sale is
 * refunded. Pure so the decision is unit-testable without Stripe/DB.
 *
 *   - already terminal (reversed / cancelled / failed) → skip
 *   - a transfer was dispatched (any non-terminal status with a transfer id) →
 *     reverse it. This deliberately covers `approved` rows whose transfer is
 *     in-flight but not yet webhook-confirmed as `paid`: money is already
 *     moving to the connected account, so cancelling the ledger row would
 *     strand it. Reverse, and let the `transfer.reversed` webhook settle it.
 *   - no transfer dispatched (pending / approved with no transfer id) → cancel
 */
export function reversalActionForStatus(status: string, hasTransfer: boolean): "reverse_transfer" | "cancel" | "skip" {
  if (status === "reversed" || status === "cancelled" || status === "failed") return "skip";
  if (hasTransfer) return "reverse_transfer";
  return "cancel";
}

/**
 * After an atomic cancel-claim (an UPDATE guarded on the observed status + a
 * null transfer id) affected `claimedCount` rows, decide what the refund path
 * must still do. Pure so the race resolution is unit-testable.
 *
 *   - claimed (>0)                          → the row was cancelled; done.
 *   - not claimed + a transfer now exists   → a concurrent payout won the race
 *     on a non-terminal row                   and dispatched money; reverse it.
 *   - otherwise (already terminal, or still  → nothing to do.
 *     no transfer)
 */
export function postCancelClaimAction(
  claimedCount: number,
  freshStatus: string | null,
  freshTransferId: string | null,
): "cancelled" | "reverse_transfer" | "skip" {
  if (claimedCount > 0) return "cancelled";
  if (!freshTransferId) return "skip";
  if (freshStatus === "reversed" || freshStatus === "cancelled") return "skip";
  return "reverse_transfer";
}

/**
 * Pay out a single **approved** vehicle-report revenue share to the施工店 via
 * Stripe Connect. Mirrors `payAgentCommission`:
 *
 *   - Only `approved` shares are paid (human approval gate — money is the急所).
 *   - The transfer carries `metadata.source_type=vehicle_report` + `source_id`,
 *     which the connect-webhook (`transfer.paid` / `transfer.reversed`) uses to
 *     flip the share to `paid` / `reversed`. We only stamp `stripe_transfer_id`
 *     here and let the webhook confirm settlement.
 *   - Idempotent via the Stripe idempotency key and the stored transfer id.
 */
export async function payVehicleReportRevenueShare(admin: Db, shareId: string): Promise<PayoutResult> {
  const { data: share } = await admin
    .from("vehicle_report_revenue_shares")
    .select("id, tenant_id, amount, currency, status, stripe_transfer_id")
    .eq("id", shareId)
    .maybeSingle();

  if (!share) return { ok: false, reason: "not_found" };
  if (share.status === "paid") {
    return { ok: true, transferId: (share.stripe_transfer_id as string | null) ?? undefined };
  }
  // A terminal share (cancelled/reversed) can still carry its old transfer id;
  // never report `pay` as an in-flight success for one — check status first.
  if (share.status === "cancelled" || share.status === "reversed" || share.status === "failed") {
    return { ok: false, reason: "not_approved" };
  }
  if (share.stripe_transfer_id) {
    // Already dispatched on a live (approved) row; the webhook will settle it.
    return { ok: true, transferId: share.stripe_transfer_id as string };
  }
  if (share.status !== "approved") return { ok: false, reason: "not_approved" };
  if (!share.amount || (share.amount as number) <= 0) return { ok: false, reason: "zero_amount" };

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", share.tenant_id as string)
    .maybeSingle();
  if (!tenant?.stripe_connect_account_id || !tenant.stripe_connect_onboarded) {
    // Self-serve onboarding lives at /api/stripe/connect (surfaced from the
    // merchant portal). Leave the share approved; a later run settles it.
    return { ok: false, reason: "tenant_not_onboarded" };
  }

  const stripe = getStripeClient();
  const transfer = await stripe.transfers.create(
    {
      amount: Math.round(share.amount as number),
      currency: ((share.currency as string | null) || "jpy").toLowerCase(),
      destination: tenant.stripe_connect_account_id as string,
      metadata: {
        source_type: "vehicle_report",
        source_id: shareId,
        fee_amount: "0",
      },
    },
    { idempotencyKey: `vehicle-report-share-payout:${shareId}` },
  );

  // A platform→connected Connect transfer settles synchronously (funded from
  // the platform balance), so the transfer IS the settlement — finalize to
  // `paid` here rather than waiting on a `transfer.paid` webhook (which the
  // current Stripe API does not emit). Claim atomically: only an un-dispatched
  // `approved` row is flipped, so a concurrent cancel/refund can't be lost.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("vehicle_report_revenue_shares")
    .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: nowIso, updated_at: nowIso })
    .eq("id", shareId)
    .eq("status", "approved")
    .is("stripe_transfer_id", null)
    .select("id");

  if (claimErr) {
    // The transfer succeeded but recording it failed (transient DB error). Do
    // NOT reverse — the money was legitimately sent. Leave the share `approved`
    // with no transfer id; a later run re-calls with the SAME idempotency key
    // (same transfer, no double-send) and finalizes it then.
    logger.error("[vehicleReportPayout] settle claim failed after transfer — will retry", {
      shareId,
      transferId: transfer.id,
      detail: claimErr.message,
    });
    return { ok: false, reason: "claim_failed" };
  }

  if (!claimed || (claimed as { id: string }[]).length === 0) {
    // The row was not claimable. Either a concurrent identical call already
    // settled it with THIS transfer (idempotency key → same transfer id: fine),
    // or it was cancelled/refunded under us (money moved: reverse it).
    const { data: curRaw, error: readErr } = await admin
      .from("vehicle_report_revenue_shares")
      .select("status, stripe_transfer_id")
      .eq("id", shareId)
      .maybeSingle();
    if (readErr) {
      // We can't tell whether a concurrent identical call already settled this
      // with THIS transfer. Reversing on a guess could claw back legitimately
      // settled money (ledger `paid`, funds gone), so do NOT reverse — leave it
      // for a later run, which re-calls with the SAME idempotency key (same
      // transfer, no double-send) and reconciles then.
      logger.error("[vehicleReportPayout] post-claim reconcile read failed — not reversing", {
        shareId,
        transferId: transfer.id,
        detail: readErr.message,
      });
      return { ok: false, reason: "reconcile_read_failed" };
    }
    const cur = curRaw as { status: string; stripe_transfer_id: string | null } | null;
    if (cur?.status === "paid" && cur.stripe_transfer_id === transfer.id) {
      return { ok: true, transferId: transfer.id };
    }
    await stripe.transfers.createReversal(
      transfer.id,
      { metadata: { source_type: "vehicle_report", source_id: shareId } },
      { idempotencyKey: `vehicle-report-share-reverse:${shareId}` },
    );
    logger.error("[vehicleReportPayout] share changed mid-transfer — reversed", {
      shareId,
      transferId: transfer.id,
      status: cur?.status,
    });
    return { ok: false, reason: "share_changed" };
  }

  logger.info("[vehicleReportPayout] transfer settled", { shareId, transferId: transfer.id });
  return { ok: true, transferId: transfer.id };
}

/**
 * Settle every `approved` share (batch). Used by the payout cron. Returns a
 * summary; per-share failures are logged and do not abort the sweep.
 */
export async function settleApprovedRevenueShares(
  admin: Db,
  limit = 500,
): Promise<{ paid: number; skipped: number; needsOnboarding: number }> {
  // Only select shares whose tenant has completed Connect onboarding (inner
  // join + filter). Otherwise a backlog of `tenant_not_onboarded` rows at the
  // head of the queue would be re-scanned every run and starve newer, payable
  // shares for onboarded tenants.
  const { data: rows, error: queueErr } = await admin
    .from("vehicle_report_revenue_shares")
    .select("id, tenants!inner(stripe_connect_onboarded)")
    .eq("status", "approved")
    .is("stripe_transfer_id", null)
    .eq("tenants.stripe_connect_onboarded", true)
    .order("created_at", { ascending: true })
    .limit(limit);

  // Surface a query failure instead of silently reporting an all-zero "success"
  // run — otherwise a persistent error would leave every approved share unpaid
  // while the cron looks healthy. The cron's failure alert fires on the throw.
  if (queueErr) {
    throw new Error(`vehicle report payout queue query failed: ${queueErr.message}`);
  }

  let paid = 0;
  let skipped = 0;
  let needsOnboarding = 0;
  let errored = 0;
  for (const r of (rows ?? []) as { id: string }[]) {
    try {
      const res = await payVehicleReportRevenueShare(admin, r.id);
      if (res.ok) paid += 1;
      else if (res.reason === "tenant_not_onboarded") needsOnboarding += 1;
      else skipped += 1;
    } catch (e) {
      errored += 1;
      logger.error("[vehicleReportPayout] share payout threw", {
        shareId: r.id,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  // Per-row isolation above keeps one bad share from aborting the sweep. But a
  // systemic failure (Stripe down, bad credentials) makes EVERY row throw with
  // nothing settled — that must not look like a healthy all-zero run. Escalate
  // so the cron's failure alert fires.
  if (errored > 0 && paid === 0) {
    throw new Error(`vehicle report payout sweep failed systemically: ${errored} share(s) threw, 0 paid`);
  }
  return { paid, skipped: skipped + errored, needsOnboarding };
}

/**
 * Roll back the merchant shares for a refunded report sale. Paid shares get
 * their Stripe transfer reversed (the connect-webhook `transfer.reversed`
 * handler flips them to `reversed`); un-paid shares are cancelled outright.
 * Idempotent: terminal rows are skipped, and reversals use an idempotency key.
 */
export async function reverseVehicleReportRevenueSharesForOrder(
  admin: Db,
  orderId: string,
): Promise<{ reversed: number; cancelled: number; skipped: number }> {
  const { data: rows, error: loadErr } = await admin
    .from("vehicle_report_revenue_shares")
    .select("id, status, stripe_transfer_id")
    .eq("order_id", orderId);

  // A transient load failure must NOT look like "no shares to reverse" — that
  // would let the caller mark the order refunded while paid shares stay
  // un-reversed. Throw so the refund workflow fails (and is surfaced) instead.
  if (loadErr) {
    throw new Error(`vehicle report share load failed for order ${orderId}: ${loadErr.message}`);
  }

  const shares = (rows ?? []) as { id: string; status: string; stripe_transfer_id: string | null }[];

  let reversed = 0;
  let cancelled = 0;
  let skipped = 0;
  let failed = 0;
  const stripe = getStripeClient();

  // Reverse one dispatched transfer; the connect-webhook `transfer.reversed`
  // handler flips the share to `reversed`. Idempotency key makes it safe to
  // re-run. Returns true on success, false (and logs) on Stripe failure.
  const doReverse = async (shareId: string, transferId: string): Promise<boolean> => {
    try {
      await stripe.transfers.createReversal(
        transferId,
        { metadata: { source_type: "vehicle_report", source_id: shareId } },
        { idempotencyKey: `vehicle-report-share-reverse:${shareId}` },
      );
      return true;
    } catch (e) {
      logger.error("[vehicleReportPayout] transfer reversal failed", {
        shareId,
        detail: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  };

  for (const s of shares) {
    const action = reversalActionForStatus(s.status, !!s.stripe_transfer_id);
    if (action === "skip") {
      skipped += 1;
      continue;
    }
    if (action === "cancel") {
      // Atomic cancel-claim: only cancel a row still in the observed state with
      // no transfer. If a concurrent payout marked it `paid` + dispatched a
      // transfer between our load and here, this affects 0 rows — then re-read
      // and reverse instead of cancelling a paid row (which would leave the
      // merchant holding funds from a refunded sale).
      // Guard on any non-terminal, no-transfer state (not just the loaded one):
      // a concurrent admin approval can flip pending→approved between our load
      // and here, and that share still needs cancelling on a refund. Only a
      // dispatched transfer (0 rows) sends us to the reverse path below.
      const { data: claimedRows, error: cancelErr } = await admin
        .from("vehicle_report_revenue_shares")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", s.id)
        .in("status", ["pending", "approved"])
        .is("stripe_transfer_id", null)
        .select("id");
      // A failed UPDATE must NOT be read as a 0-row race — that would `skip` an
      // un-cancelled share and let the caller mark the order refunded while the
      // share stays payable. Throw so the refund workflow fails and is surfaced
      // (the reversal is idempotent, so a replay is safe).
      if (cancelErr) {
        throw new Error(`vehicle report share cancel-claim failed for ${s.id}: ${cancelErr.message}`);
      }
      const claimedCount = (claimedRows as { id: string }[] | null)?.length ?? 0;

      let freshStatus: string | null = s.status;
      let freshTransferId: string | null = null;
      if (claimedCount === 0) {
        // This re-read is the only way to discover a transfer a concurrent
        // payout just dispatched. A failed read must NOT collapse to `skip`
        // (which would leave a paid share un-reversed on a refunded sale) —
        // throw so the refund fails and is surfaced for replay.
        const { data: freshRaw, error: freshErr } = await admin
          .from("vehicle_report_revenue_shares")
          .select("status, stripe_transfer_id")
          .eq("id", s.id)
          .maybeSingle();
        if (freshErr) {
          throw new Error(`vehicle report share reconcile read failed for ${s.id}: ${freshErr.message}`);
        }
        const fresh = freshRaw as { status: string; stripe_transfer_id: string | null } | null;
        freshStatus = fresh?.status ?? null;
        freshTransferId = fresh?.stripe_transfer_id ?? null;
      }

      const next = postCancelClaimAction(claimedCount, freshStatus, freshTransferId);
      if (next === "cancelled") cancelled += 1;
      else if (next === "skip") skipped += 1;
      else if (await doReverse(s.id, freshTransferId as string)) reversed += 1;
      else failed += 1;
      continue;
    }
    // reverse_transfer: let the webhook flip status to `reversed` on success.
    if (await doReverse(s.id, s.stripe_transfer_id as string)) reversed += 1;
    else failed += 1;
  }

  logger.info("[vehicleReportPayout] order shares rolled back", { orderId, reversed, cancelled, skipped, failed });

  // A paid share whose transfer could not be reversed means the merchant still
  // holds funds from a refunded sale. Throw so the caller (charge.refunded
  // handler) fails: the event row stays `processed_at IS NULL` with the error,
  // so the stripe-event-monitor cron alerts ops within 5 min for a manual
  // replay (Stripe Dashboard resend after clearing the claim) — never silently
  // complete the refund with money stranded. Reversals are idempotent, so a
  // replay re-attempts only the ones that failed.
  if (failed > 0) {
    throw new Error(`vehicle report revenue share reversal failed for ${failed} share(s) on order ${orderId}`);
  }

  return { reversed, cancelled, skipped };
}
