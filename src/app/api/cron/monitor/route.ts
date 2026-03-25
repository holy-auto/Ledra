import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const RESEND_API = "https://api.resend.com/emails";

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

  const supabase = getSupabaseAdmin();
  const alerts: string[] = [];
  const now = new Date();
  const oneDayAgo = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // ─── 1. Billing inconsistencies ───
  // Tenants with a Stripe subscription but is_active=false
  try {
    const { data: billingIssues } = await supabase
      .from("tenants")
      .select("id, name, plan_tier, is_active, stripe_subscription_id")
      .not("stripe_subscription_id", "is", null)
      .eq("is_active", false);

    if (billingIssues && billingIssues.length > 0) {
      alerts.push(
        `BILLING: ${billingIssues.length} tenant(s) have subscription but is_active=false`,
      );
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
    const { data: accessLogs } = await supabase
      .from("insurer_access_logs")
      .select("insurer_id")
      .gte("created_at", oneDayAgo);

    const accessCounts: Record<string, number> = {};
    (accessLogs ?? []).forEach((log: { insurer_id: string }) => {
      accessCounts[log.insurer_id] =
        (accessCounts[log.insurer_id] || 0) + 1;
    });

    heavyAccessors = Object.entries(accessCounts)
      .filter(([, count]) => count > 500)
      .map(([id, count]) => `${id}: ${count} accesses`);

    if (heavyAccessors.length > 0) {
      alerts.push(
        `SECURITY: Heavy insurer access - ${heavyAccessors.join(", ")}`,
      );
    }
  } catch (e) {
    console.error("[cron/monitor] insurer access check failed:", e);
  }

  const summary = {
    timestamp: now.toISOString(),
    status: alerts.length === 0 ? "healthy" : "alerts",
    metrics: {
      certificates_24h: certCount24h,
      webhooks_24h: webhookCount24h,
      billing_issues: 0,
      heavy_insurer_access: heavyAccessors.length,
    },
    alerts,
  };

  // ─── Send alert email if issues found ───
  if (alerts.length > 0) {
    const apiKey = process.env.RESEND_API_KEY;
    const alertEmail = process.env.CONTACT_EMAIL_TO;
    if (apiKey && alertEmail) {
      try {
        await fetch(RESEND_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM ?? "noreply@cartrust.co.jp",
            to: alertEmail,
            subject: `[CARTRUST Monitor] ${alerts.length} alert(s) detected`,
            text: [
              "Monitoring Report",
              "",
              ...alerts,
              "",
              "Metrics:",
              JSON.stringify(summary.metrics, null, 2),
            ].join("\n"),
          }),
        });
      } catch {
        console.error("[cron/monitor] failed to send alert email");
      }
    }
  }

  console.log("[cron/monitor] daily check complete", summary);
  return NextResponse.json(summary);
}
