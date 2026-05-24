/**
 * GET /api/cron/stripe-event-monitor
 *
 * Stripe webhook safety-net: scan `stripe_processed_events` for rows that
 * were claimed but never finished inline processing (`processed_at IS NULL`
 * older than STUCK_THRESHOLD_MIN minutes), and alert ops. Two reasons a
 * claim can stick:
 *
 *   1. The inline switch threw — `error_message` is populated, ops can read
 *      it to decide whether to retry via Stripe Dashboard "Resend Webhook".
 *   2. The Vercel function timed out mid-processing — `error_message` is NULL
 *      but the row remained because we already returned 200. Same remediation.
 *
 * This cron does NOT re-invoke the webhook itself (no idempotency contract
 * to safely re-claim a partially-processed event). Instead it gives ops
 * actionable forensic data: event_id, event_type, age, last error, and the
 * captured payload. Manual replay path is the Stripe Dashboard.
 *
 * Phase 2 (separate PR): once we extract the inline switch into a
 * `processStripeEvent(event)` function, this cron can become an actual
 * retry worker that increments `attempts` and dispatches.
 *
 * Schedule: every 5 minutes. Lock for 4 minutes to prevent overlap.
 */

import type { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { withCronLock } from "@/lib/cron/lock";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/sendEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rows older than this with processed_at=NULL are "stuck" and alert-worthy. */
const STUCK_THRESHOLD_MIN = 5;
/** Cap the alert payload — avoids massive emails when something is wrong. */
const MAX_ROWS_PER_ALERT = 20;

interface StuckRow {
  event_id: string;
  event_type: string;
  created_at: string;
  error_message: string | null;
  attempts: number;
}

async function sendStuckEventsAlert(rows: StuckRow[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) {
    logger.warn("stripe-event-monitor: would alert but RESEND_API_KEY / CONTACT_TO_EMAIL not configured", {
      stuck_count: rows.length,
    });
    return;
  }

  const from = process.env.RESEND_FROM ?? "noreply@ledra.co.jp";
  const truncated = rows.length > MAX_ROWS_PER_ALERT;
  const visibleRows = rows.slice(0, MAX_ROWS_PER_ALERT);
  const subject = `[Ledra] Stripe webhook events stuck (${rows.length} pending)`;

  const lines = [
    `${rows.length} Stripe webhook event(s) were claimed but inline processing did not complete.`,
    `Showing ${visibleRows.length}${truncated ? ` of ${rows.length}` : ""}:`,
    "",
    ...visibleRows.map(
      (r) =>
        `- ${r.event_id} (${r.event_type}) age=${Math.round(
          (Date.now() - new Date(r.created_at).getTime()) / 60_000,
        )}m attempts=${r.attempts}${r.error_message ? ` last_error="${r.error_message.slice(0, 200)}"` : ""}`,
    ),
    "",
    "Remediation:",
    "  1. Inspect the row in Supabase Studio (stripe_processed_events).",
    "  2. If error_message indicates a transient issue (e.g. Stripe API 5xx),",
    "     use Stripe Dashboard → Developers → Webhooks → Resend to replay.",
    "  3. If error_message indicates a code bug, fix and ship; the next resend",
    "     will succeed.",
    "  4. Once processed, manually UPDATE processed_at=now() so this alert stops.",
  ];

  try {
    await sendEmail({ from, to, subject, text: lines.join("\n") });
  } catch (e) {
    logger.error("stripe-event-monitor: failed to send alert email", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function GET(req: NextRequest) {
  const { authorized, error: authErr } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authErr);

  try {
    const admin = createServiceRoleAdmin("cron:stripe-event-monitor — scans webhook claim table");

    const result = await withCronLock(admin, "stripe-event-monitor", 240, async () => {
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60_000).toISOString();

      const { data, error } = await admin
        .from("stripe_processed_events")
        .select("event_id, event_type, created_at, error_message, attempts")
        .is("processed_at", null)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        throw new Error(`failed to query stuck events: ${error.message}`);
      }

      const rows = (data ?? []) as StuckRow[];
      if (rows.length === 0) {
        return { stuck: 0, alerted: false };
      }

      await sendStuckEventsAlert(rows);
      logger.error("stripe-event-monitor: stuck events detected", {
        stuck_count: rows.length,
        oldest_event_id: rows[0].event_id,
        oldest_age_min: Math.round((Date.now() - new Date(rows[0].created_at).getTime()) / 60_000),
      });
      return { stuck: rows.length, alerted: true };
    });

    if (!result.acquired) return apiOk({ skipped: "lock_held" });
    return apiOk({ ok: true, ...result.value });
  } catch (e) {
    await sendCronFailureAlert("stripe-event-monitor", e instanceof Error ? e.message : String(e));
    return apiInternalError(e, "cron/stripe-event-monitor");
  }
}
