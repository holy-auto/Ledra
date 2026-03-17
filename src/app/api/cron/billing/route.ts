import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const RESEND_API = "https://api.resend.com/emails";

async function sendReminderEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function wrapEmail(title: string, body: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">${title}</h2>
      </div>
      ${body}
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        CARTRUST
      </div>
    </div>
  `;
}

/**
 * Billing Cron Job
 * 1. Auto-detect overdue invoices (due_date < today AND status = 'sent')
 * 2. Send reminder emails for due_soon (7 days before) and overdue (3 days after)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiUnauthorized();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseServiceKey) {
    return apiInternalError(new Error("Missing Supabase config"), "cron/billing");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().slice(0, 10);
  let overdueUpdated = 0;
  let remindersSent = 0;

  // ─── 1. Auto-detect overdue ───
  try {
    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id")
      .eq("status", "sent")
      .lt("due_date", today)
      .not("due_date", "is", null);

    if (overdueInvoices && overdueInvoices.length > 0) {
      const ids = overdueInvoices.map((inv) => inv.id);
      const { count } = await supabase
        .from("invoices")
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .in("id", ids);
      overdueUpdated = count ?? ids.length;
    }
  } catch (e) {
    console.error("[cron/billing] overdue detection failed:", e);
  }

  // ─── 2. Send reminders ───
  try {
    // Find overdue invoices (3 days past due) that haven't been reminded yet
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

    const { data: overdueForReminder } = await supabase
      .from("invoices")
      .select("id, tenant_id, customer_id, invoice_number, total, due_date")
      .eq("status", "overdue")
      .lte("due_date", threeDaysAgoStr);

    for (const inv of overdueForReminder ?? []) {
      // Check if already notified
      const { count: alreadySent } = await supabase
        .from("notification_logs")
        .select("*", { count: "exact", head: true })
        .eq("target_type", "invoice")
        .eq("target_id", inv.id)
        .eq("type", "overdue_reminder");

      if ((alreadySent ?? 0) > 0) continue;

      // Get customer email
      if (!inv.customer_id) continue;
      const { data: customer } = await supabase
        .from("customers")
        .select("name, email")
        .eq("id", inv.customer_id)
        .single();

      if (!customer?.email) continue;

      // Get tenant name
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", inv.tenant_id)
        .single();

      const shopName = tenant?.name ?? "施工店";
      const html = wrapEmail(
        "お支払いのお願い",
        `
          <p style="color: #1d1d1f; font-size: 14px;">
            ${customer.name} 様<br><br>
            ${shopName}より、請求書 <strong>${inv.invoice_number}</strong> のお支払い期限が過ぎております。
          </p>
          <div style="background: #fff3cd; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #856404;">
            請求額: <strong>¥${(inv.total ?? 0).toLocaleString("ja-JP")}</strong><br>
            お支払期限: <strong>${inv.due_date}</strong>
          </div>
          <p style="font-size: 13px; color: #86868b;">お心当たりがない場合は、お手数ですが ${shopName} までお問い合わせください。</p>
        `,
      );

      const sent = await sendReminderEmail(
        customer.email,
        `[${shopName}] お支払いのお願い: ${inv.invoice_number}`,
        html,
      );

      // Log notification
      await supabase.from("notification_logs").insert({
        tenant_id: inv.tenant_id,
        type: "overdue_reminder",
        target_type: "invoice",
        target_id: inv.id,
        recipient_email: customer.email,
        status: sent ? "sent" : "failed",
      });

      if (sent) remindersSent++;
    }

    // Find invoices due in 7 days
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);

    const { data: dueSoonInvoices } = await supabase
      .from("invoices")
      .select("id, tenant_id, customer_id, invoice_number, total, due_date")
      .eq("status", "sent")
      .eq("due_date", sevenDaysLaterStr);

    for (const inv of dueSoonInvoices ?? []) {
      const { count: alreadySent } = await supabase
        .from("notification_logs")
        .select("*", { count: "exact", head: true })
        .eq("target_type", "invoice")
        .eq("target_id", inv.id)
        .eq("type", "due_soon");

      if ((alreadySent ?? 0) > 0) continue;

      if (!inv.customer_id) continue;
      const { data: customer } = await supabase
        .from("customers")
        .select("name, email")
        .eq("id", inv.customer_id)
        .single();

      if (!customer?.email) continue;

      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", inv.tenant_id)
        .single();

      const shopName = tenant?.name ?? "施工店";
      const html = wrapEmail(
        "お支払期限のご案内",
        `
          <p style="color: #1d1d1f; font-size: 14px;">
            ${customer.name} 様<br><br>
            ${shopName}より、請求書 <strong>${inv.invoice_number}</strong> のお支払期限が近づいております。
          </p>
          <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
            請求額: <strong>¥${(inv.total ?? 0).toLocaleString("ja-JP")}</strong><br>
            お支払期限: <strong>${inv.due_date}</strong>
          </div>
        `,
      );

      const sent = await sendReminderEmail(
        customer.email,
        `[${shopName}] お支払期限のご案内: ${inv.invoice_number}`,
        html,
      );

      await supabase.from("notification_logs").insert({
        tenant_id: inv.tenant_id,
        type: "due_soon",
        target_type: "invoice",
        target_id: inv.id,
        recipient_email: customer.email,
        status: sent ? "sent" : "failed",
      });

      if (sent) remindersSent++;
    }
  } catch (e) {
    console.error("[cron/billing] reminder sending failed:", e);
  }

  return NextResponse.json({
    ok: true,
    overdue_updated: overdueUpdated,
    reminders_sent: remindersSent,
    date: today,
  });
}
