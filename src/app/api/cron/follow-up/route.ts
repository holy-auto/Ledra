import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendExpiryReminder, sendFollowUpEmail } from "@/lib/follow-up/email";

export const dynamic = "force-dynamic";

/**
 * Follow-up Cron Job
 * 1. Send expiry reminders for certificates approaching expiry_date
 * 2. Send post-service follow-up emails
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    for (const setting of settings ?? []) {
      const reminderDays: number[] = setting.reminder_days_before ?? [30, 7, 1];

      // Get tenant name
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", setting.tenant_id)
        .single();
      const shopName = tenant?.name ?? "施工店";

      // Check each reminder day
      for (const days of reminderDays) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);
        const targetDateStr = targetDate.toISOString().slice(0, 10);

        const { data: certs } = await supabase
          .from("certificates")
          .select("id, customer_id, customer_name, service_name, expiry_date")
          .eq("tenant_id", setting.tenant_id)
          .eq("expiry_date", targetDateStr)
          .neq("status", "void");

        for (const cert of certs ?? []) {
          if (!cert.customer_id) continue;

          // Check if already notified
          const { count } = await supabase
            .from("notification_logs")
            .select("*", { count: "exact", head: true })
            .eq("target_type", "certificate")
            .eq("target_id", cert.id)
            .eq("type", `expiry_reminder_${days}d`);

          if ((count ?? 0) > 0) continue;

          // Get customer email
          const { data: customer } = await supabase
            .from("customers")
            .select("name, email")
            .eq("id", cert.customer_id)
            .single();

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
      }

      // ─── 2. Post-service follow-up ───
      const followUpDays: number[] = setting.follow_up_days_after ?? [90, 180];

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
          if (!cert.customer_id) continue;

          const { count } = await supabase
            .from("notification_logs")
            .select("*", { count: "exact", head: true })
            .eq("target_type", "certificate")
            .eq("target_id", cert.id)
            .eq("type", `follow_up_${days}d`);

          if ((count ?? 0) > 0) continue;

          const { data: customer } = await supabase
            .from("customers")
            .select("name, email")
            .eq("id", cert.customer_id)
            .single();

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
