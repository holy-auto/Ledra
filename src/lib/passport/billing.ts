/**
 * Passport API metered billing.
 *
 * For each `passport_api_consumers` row, the monthly cron:
 *   1. Counts calls in `passport_api_call_logs` for the previous calendar
 *      month [period_start, period_end) in UTC.
 *   2. Upserts the rollup into `passport_api_billing_periods` (one row
 *      per consumer × month, idempotent on re-run).
 *   3. If the consumer has `stripe_subscription_item_id` set, POSTs the
 *      usage to Stripe via `subscriptionItems.createUsageRecord` with
 *      `action: 'set'`. action=set is idempotent: re-running the cron
 *      for the same month overwrites the period total instead of
 *      accumulating, so duplicates from accidental triggers net to zero.
 *
 * Consumers without a `stripe_subscription_item_id` still get a
 * billing-period row created so the operator can invoice manually
 * (CSV export from /admin/platform/passport-consumers/[id]).
 *
 * See: docs/vehicle-passport-design.md §7.3 (billing & governance).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, any, any>;

/**
 * UTC calendar-month boundaries for "the month prior to `now`".
 * Examples (now in UTC):
 *   2026-05-26 → { start: 2026-04-01, end: 2026-05-01 }
 *   2026-01-15 → { start: 2025-12-01, end: 2026-01-01 }
 */
export function previousMonthRangeUtc(now: Date = new Date()): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  // start: first day of (m-1) month
  const start = new Date(Date.UTC(y, m - 1, 1));
  // end: first day of m month (exclusive upper bound)
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

/** Format a Date as YYYY-MM-DD in UTC, suitable for Postgres `date`. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Count successful + failed calls for a consumer in [start, end). We bill
 * on *attempted* calls, including 4xx — abusive callers shouldn't be free.
 * The DB index on (consumer_id, called_at DESC) makes this cheap.
 */
export async function countCallsInPeriod(admin: AdminDb, consumerId: string, start: Date, end: Date): Promise<number> {
  const { count, error } = await admin
    .from("passport_api_call_logs")
    .select("id", { count: "exact", head: true })
    .eq("consumer_id", consumerId)
    .gte("called_at", start.toISOString())
    .lt("called_at", end.toISOString());
  if (error) throw new Error(`countCallsInPeriod: ${error.message}`);
  return count ?? 0;
}

type ConsumerRow = {
  id: string;
  name: string;
  status: string;
  stripe_subscription_item_id: string | null;
};

type PeriodRow = {
  id: string;
  consumer_id: string;
  period_start: string;
  period_end: string;
  call_count: number;
  reported_to_stripe_at: string | null;
  stripe_usage_record_id: string | null;
};

export type ConsumerBillingResult =
  | { consumerId: string; status: "skipped"; reason: "inactive" | "no_calls"; callCount: number }
  | { consumerId: string; status: "recorded"; reason: "no_stripe_link"; callCount: number; periodId: string }
  | {
      consumerId: string;
      status: "reported";
      callCount: number;
      periodId: string;
      stripeUsageRecordId: string;
    }
  | { consumerId: string; status: "stripe_failed"; callCount: number; periodId: string; error: string };

/**
 * Aggregate one consumer's calls for [start, end), upsert the billing
 * period row, and (if linked) POST to Stripe. Idempotent: action='set'
 * means re-running the same period overwrites the Stripe-side total.
 */
export async function runBillingForConsumer(args: {
  admin: AdminDb;
  consumer: ConsumerRow;
  start: Date;
  end: Date;
  stripe?: Stripe;
}): Promise<ConsumerBillingResult> {
  const { admin, consumer, start, end } = args;

  if (consumer.status !== "active") {
    return { consumerId: consumer.id, status: "skipped", reason: "inactive", callCount: 0 };
  }

  const callCount = await countCallsInPeriod(admin, consumer.id, start, end);

  if (callCount === 0) {
    return { consumerId: consumer.id, status: "skipped", reason: "no_calls", callCount: 0 };
  }

  const periodStart = toIsoDate(start);
  const periodEnd = toIsoDate(end);

  // Upsert the rollup. ON CONFLICT (consumer_id, period_start) keeps
  // the same row across re-runs so we can re-target the same Stripe
  // usage record without creating dupes.
  const { data: upserted, error: upErr } = await admin
    .from("passport_api_billing_periods")
    .upsert(
      {
        consumer_id: consumer.id,
        period_start: periodStart,
        period_end: periodEnd,
        call_count: callCount,
        last_attempt_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "consumer_id,period_start" },
    )
    .select("id, consumer_id, period_start, period_end, call_count, reported_to_stripe_at, stripe_usage_record_id")
    .single();
  if (upErr || !upserted) {
    throw new Error(`billing period upsert: ${upErr?.message ?? "no row"}`);
  }
  const period = upserted as PeriodRow;

  if (!consumer.stripe_subscription_item_id) {
    return {
      consumerId: consumer.id,
      status: "recorded",
      reason: "no_stripe_link",
      callCount,
      periodId: period.id,
    };
  }

  // POST usage to Stripe with action='set'. Pinning the timestamp to the
  // period-end-minus-1s keeps the usage record inside the right period
  // even when the cron runs late.
  const stripe = args.stripe ?? getStripeClient();
  const timestamp = Math.floor((end.getTime() - 1000) / 1000);

  try {
    // Stripe v20 still ships the legacy usage record API but its TS
    // namespace has been deprecated; cast via unknown so we don't pin
    // ourselves to a moving SDK shape.
    const subItems = stripe.subscriptionItems as unknown as {
      createUsageRecord: (
        siId: string,
        body: { quantity: number; action: "set" | "increment"; timestamp: number },
      ) => Promise<{ id?: string } | null>;
    };
    const usage = await subItems.createUsageRecord(consumer.stripe_subscription_item_id, {
      quantity: callCount,
      action: "set",
      timestamp,
    });

    await admin
      .from("passport_api_billing_periods")
      .update({
        reported_to_stripe_at: new Date().toISOString(),
        stripe_usage_record_id: usage?.id ?? null,
        last_error: null,
      })
      .eq("id", period.id);

    return {
      consumerId: consumer.id,
      status: "reported",
      callCount,
      periodId: period.id,
      stripeUsageRecordId: usage?.id ?? "",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("[passport-billing] stripe usage record failed", {
      consumerId: consumer.id,
      periodStart,
      error: msg,
    });
    await admin
      .from("passport_api_billing_periods")
      .update({ last_error: msg.slice(0, 500), last_attempt_at: new Date().toISOString() })
      .eq("id", period.id);
    return { consumerId: consumer.id, status: "stripe_failed", callCount, periodId: period.id, error: msg };
  }
}

export type RunPassportBillingResult = {
  period_start: string;
  period_end: string;
  consumers: ConsumerBillingResult[];
  reported_count: number;
  recorded_count: number;
  skipped_count: number;
  failed_count: number;
};

/**
 * Walk every consumer and aggregate / report for the given period.
 * The cron route calls this with the previous-month range.
 */
export async function runPassportBilling(args: {
  admin: AdminDb;
  start: Date;
  end: Date;
  stripe?: Stripe;
}): Promise<RunPassportBillingResult> {
  const { admin, start, end } = args;
  const { data: consumersRaw, error } = await admin
    .from("passport_api_consumers")
    .select("id, name, status, stripe_subscription_item_id");
  if (error) throw new Error(`consumer fetch: ${error.message}`);
  const consumers = (consumersRaw ?? []) as ConsumerRow[];

  const results: ConsumerBillingResult[] = [];
  for (const c of consumers) {
    try {
      const r = await runBillingForConsumer({ admin, consumer: c, start, end, stripe: args.stripe });
      results.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("[passport-billing] consumer failed", { consumerId: c.id, error: msg });
      results.push({ consumerId: c.id, status: "stripe_failed", callCount: 0, periodId: "", error: msg });
    }
  }

  return {
    period_start: toIsoDate(start),
    period_end: toIsoDate(end),
    consumers: results,
    reported_count: results.filter((r) => r.status === "reported").length,
    recorded_count: results.filter((r) => r.status === "recorded").length,
    skipped_count: results.filter((r) => r.status === "skipped").length,
    failed_count: results.filter((r) => r.status === "stripe_failed").length,
  };
}
