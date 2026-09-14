import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendHeartbeat } from "@/lib/observability/healthchecks";
import { sendEmail } from "@/lib/email/sendEmail";

export const dynamic = "force-dynamic";

/**
 * Daily Monitoring Cron Job (08:00 JST)
 *
 * Supplements Sentry by detecting issues that don't throw exceptions:
 * - Billing state inconsistencies (Stripe subscription vs DB is_active)
 * - Certificate creation volume anomalies
 * - Webhook processing gaps
 * - Unusual insurer access patterns
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return apiUnauthorized(authError);
  }

  const supabase = createServiceRoleAdmin(
    "cron:monitor — scans billing/certificate/webhook anomalies across every tenant",
  );
  const alerts: string[] = [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // ─── 1. Billing inconsistencies ───
  // Tenants with a Stripe subscription but is_active=false
  let billingIssueCount = 0;
  try {
    const { data: billingIssues } = await supabase
      .from("tenants")
      .select("id, name, plan_tier, is_active, stripe_subscription_id")
      .not("stripe_subscription_id", "is", null)
      .eq("is_active", false);

    if (billingIssues && billingIssues.length > 0) {
      billingIssueCount = billingIssues.length;
      alerts.push(`BILLING: ${billingIssues.length} tenant(s) have subscription but is_active=false`);
    }
  } catch (e) {
    console.error("[cron/monitor] billing check failed:", e);
  }

  // ─── 2. Certificate creation volume (24h) ───
  let certCount24h = 0;
  try {
    const { count } = await supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo);
    certCount24h = count ?? 0;
  } catch (e) {
    console.error("[cron/monitor] certificate count failed:", e);
  }

  // ─── 3. Webhook processing volume (24h) ───
  let webhookCount24h = 0;
  try {
    const { count } = await supabase
      .from("stripe_processed_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo);
    webhookCount24h = count ?? 0;
  } catch (e) {
    console.error("[cron/monitor] webhook count failed:", e);
  }

  // ─── 4. Insurer access patterns (24h) ───
  let heavyAccessors: string[] = [];
  try {
    const { data: accessCounts, error } = await supabase.rpc("monitor_heavy_insurer_access", {
      p_since: oneDayAgo,
      p_threshold: 500,
    });
    if (error) throw error;
    heavyAccessors = ((accessCounts ?? []) as Array<{ insurer_id: string; access_count: number }>).map(
      ({ insurer_id, access_count }) => `${insurer_id}: ${access_count} accesses`,
    );

    if (heavyAccessors.length > 0) {
      alerts.push(`SECURITY: Heavy insurer access - ${heavyAccessors.join(", ")}`);
    }
  } catch (e) {
    console.error("[cron/monitor] insurer access check failed:", e);
  }

  // ─── 5. Queue backlog / integration lag ───
  let outboxPending = 0;
  let outboxOldestAgeSec = 0;
  let gcalLagging = 0;
  let accountingLagging = 0;
  try {
    const [pendingRes, oldestRes, gcalRes, accountingRes] = await Promise.all([
      supabase.from("outbox_events").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase
        .from("outbox_events")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("gcal_sync_enabled", true)
        .or(`gcal_last_synced_at.is.null,gcal_last_synced_at.lt.${oneHourAgo}`),
      supabase
        .from("accounting_integrations")
        .select("tenant_id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("auto_sync_enabled", true)
        .or(`last_synced_at.is.null,last_synced_at.lt.${oneHourAgo}`),
    ]);
    outboxPending = pendingRes.count ?? 0;
    gcalLagging = gcalRes.count ?? 0;
    accountingLagging = accountingRes.count ?? 0;
    if (oldestRes.data?.created_at) {
      outboxOldestAgeSec = Math.max(
        0,
        Math.round((now.getTime() - new Date(oldestRes.data.created_at).getTime()) / 1000),
      );
    }
    if (outboxPending > 1_000 || outboxOldestAgeSec > 600) {
      alerts.push(`QUEUE: pending=${outboxPending}, oldest=${outboxOldestAgeSec}s`);
    }
    if (gcalLagging > 0) alerts.push(`GCAL: ${gcalLagging} integration(s) have not synced within 1h`);
    if (accountingLagging > 0) alerts.push(`ACCOUNTING: ${accountingLagging} integration(s) have not synced within 1h`);
  } catch (e) {
    console.error("[cron/monitor] backlog/lag check failed:", e);
  }

  const summary = {
    timestamp: now.toISOString(),
    status: alerts.length === 0 ? "healthy" : "alerts",
    metrics: {
      certificates_24h: certCount24h,
      webhooks_24h: webhookCount24h,
      billing_issues: billingIssueCount,
      heavy_insurer_access: heavyAccessors.length,
      outbox_pending: outboxPending,
      outbox_oldest_age_sec: outboxOldestAgeSec,
      gcal_lagging_integrations: gcalLagging,
      accounting_lagging_integrations: accountingLagging,
    },
    alerts,
  };

  // ─── Send alert email if issues found ───
  if (alerts.length > 0) {
    const apiKey = process.env.RESEND_API_KEY;
    const alertEmail = process.env.CONTACT_TO_EMAIL;
    if (apiKey && alertEmail) {
      try {
        await sendEmail({
          from: process.env.RESEND_FROM ?? "noreply@ledra.co.jp",
          to: alertEmail,
          subject: `[Ledra Monitor] ${alerts.length} alert(s) detected`,
          text: ["Monitoring Report", "", ...alerts, "", "Metrics:", JSON.stringify(summary.metrics, null, 2)].join(
            "\n",
          ),
        });
      } catch {
        console.error("[cron/monitor] failed to send alert email");
      }
    }
  }

  console.info("[cron/monitor] daily check complete", summary);

  // G15: Healthchecks.io への heartbeat ping
  // — monitor 自身が長期間動かなくなった場合、Healthchecks 側の grace 経過で
  //   別経路 (SaaS のメール / Slack) からアラート発火
  // — Vercel 全断 (= monitor cron が発火しない) も検知可能
  await sendHeartbeat(process.env.HEALTHCHECKS_MONITOR_PING_URL);

  return apiJson(summary);
}
