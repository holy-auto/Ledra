import { NextRequest, NextResponse } from "next/server";
import { sendExpiryReminder, sendFollowUpEmail } from "@/lib/follow-up/email";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Follow-up Cron Job
 * 1. Send expiry reminders for certificates approaching expiry_date
 * 2. Send post-service follow-up emails
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return apiUnauthorized(authError);
  }

  const supabase = getSupabaseAdmin();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let remindersSent = 0;
  let followUpsSent = 0;

  // ─── 1. Expiry reminders ───
  try {
    // Get all tenants with follow-up enabled
    const { data: settings } = await supabase
      .from("follow_up_settings")
      .select("tenant_id, reminder_days_before, follow_up_days_after, enabled")
      .eq("enabled", true);

    if (settings && settings.length > 0) {
      // Batch fetch all tenant names
      const allTenantIds = [...new Set(settings.map((s) => s.tenant_id))];
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", allTenantIds);
      const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t.name]));

      for (const setting of settings) {
        const shopName = tenantMap.get(setting.tenant_id) ?? "施工店";
        const reminderDays: number[] = setting.reminder_days_before ?? [30, 7, 1];

        // Build all target dates for this tenant's reminder days
        const targetDates = reminderDays.map((days) => {
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() + days);
          return { days, dateStr: targetDate.toISOString().slice(0, 10) };
        });

        // Batch fetch certificates for all target dates at once
        const allCerts: Array<{ days: number; cert: any }> = [];
        for (const { days, dateStr } of targetDates) {
          const { data: certs } = await supabase
            .from("certificates")
            .select("id, customer_id, customer_name, service_name, expiry_date")
            .eq("tenant_id", setting.tenant_id)
            .eq("expiry_date", dateStr)
            .neq("status", "void");

          for (const cert of certs ?? []) {
            if (cert.customer_id) allCerts.push({ days, cert });
          }
        }

        if (allCerts.length === 0) continue;

        // Batch fetch notification logs for all certs
        const certIds = allCerts.map((c) => c.cert.id);
        const notifTypes = [...new Set(allCerts.map((c) => `expiry_reminder_${c.days}d`))];
        const { data: existingLogs } = await supabase
          .from("notification_logs")
          .select("target_id, type")
          .eq("target_type", "certificate")
          .in("target_id", certIds)
          .in("type", notifTypes);

        const notifiedSet = new Set((existingLogs ?? []).map((l) => `${l.target_id}:${l.type}`));

        // Batch fetch customer details
        const customerIds = [...new Set(allCerts.map((c) => c.cert.customer_id))];
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, email")
          .in("id", customerIds);
        const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));

        for (const { days, cert } of allCerts) {
          const notifKey = `${cert.id}:expiry_reminder_${days}d`;
          if (notifiedSet.has(notifKey)) continue;

          const customer = customerMap.get(cert.customer_id);
          if (!customer?.email) continue;

          const sent = await sendExpiryReminder({
            shopName,
            customerEmail: customer.email,
            customerName: customer.name ?? cert.customer_name ?? "お客様",
            certificateLabel: cert.service_name ?? "施工証明書",
            expiryDate: cert.expiry_date,
            daysUntil: days,
          });

          await supabase.from("notification_logs").insert({
            tenant_id: setting.tenant_id,
            type: `expiry_reminder_${days}d`,
            target_type: "certificate",
            target_id: cert.id,
            recipient_email: customer.email,
            status: sent ? "sent" : "failed",
          });

          if (sent) remindersSent++;
        }

        // ─── 2. Post-service follow-up ───
        const followUpDays: number[] = setting.follow_up_days_after ?? [90, 180];

        const followUpCerts: Array<{ days: number; cert: any }> = [];
        for (const days of followUpDays) {
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() - days);
          const targetDateStr = targetDate.toISOString().slice(0, 10);

          const { data: certs } = await supabase
            .from("certificates")
            .select("id, customer_id, customer_name, service_name, created_at")
            .eq("tenant_id", setting.tenant_id)
            .neq("status", "void")
            .gte("created_at", `${targetDateStr}T00:00:00`)
            .lte("created_at", `${targetDateStr}T23:59:59`);

          for (const cert of certs ?? []) {
            if (cert.customer_id) followUpCerts.push({ days, cert });
          }
        }

        if (followUpCerts.length === 0) continue;

        // Batch fetch notification logs for follow-up certs
        const fuCertIds = followUpCerts.map((c) => c.cert.id);
        const fuNotifTypes = [...new Set(followUpCerts.map((c) => `follow_up_${c.days}d`))];
        const { data: fuExistingLogs } = await supabase
          .from("notification_logs")
          .select("target_id, type")
          .eq("target_type", "certificate")
          .in("target_id", fuCertIds)
          .in("type", fuNotifTypes);

        const fuNotifiedSet = new Set((fuExistingLogs ?? []).map((l) => `${l.target_id}:${l.type}`));

        // Batch fetch customer details for follow-up
        const fuCustomerIds = [...new Set(followUpCerts.map((c) => c.cert.customer_id))];
        const { data: fuCustomers } = await supabase
          .from("customers")
          .select("id, name, email")
          .in("id", fuCustomerIds);
        const fuCustomerMap = new Map((fuCustomers ?? []).map((c) => [c.id, c]));

        for (const { days, cert } of followUpCerts) {
          const notifKey = `${cert.id}:follow_up_${days}d`;
          if (fuNotifiedSet.has(notifKey)) continue;

          const customer = fuCustomerMap.get(cert.customer_id);
          if (!customer?.email) continue;

          const sent = await sendFollowUpEmail({
            shopName,
            customerEmail: customer.email,
            customerName: customer.name ?? cert.customer_name ?? "お客様",
            certificateLabel: cert.service_name ?? "施工証明書",
            daysSince: days,
          });

          await supabase.from("notification_logs").insert({
            tenant_id: setting.tenant_id,
            type: `follow_up_${days}d`,
            target_type: "certificate",
            target_id: cert.id,
            recipient_email: customer.email,
            status: sent ? "sent" : "failed",
          });

          if (sent) followUpsSent++;
        }
      }
    }
  } catch (e) {
    console.error("[cron/follow-up] failed:", e);
  }

  return NextResponse.json({
    ok: true,
    reminders_sent: remindersSent,
    follow_ups_sent: followUpsSent,
    date: todayStr,
  });
}
