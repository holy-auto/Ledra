import { NextRequest, NextResponse } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";

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
        Ledra
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
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return apiUnauthorized(authError);
  }

  try {
    const supabase = createServiceRoleAdmin("cron:billing — sweeps overdue invoices across every tenant");

    // 万一 cron が同時起動しても、リマインダー二重送信を防ぐ。
    // 600s TTL は通常の処理時間 (数秒〜十数秒) を十分越え、かつ
    // 落ちた cron が翌日まで残らない長さ。
    const lockResult = await withCronLock(supabase, "billing", 600, () => runBillingCron(supabase));
    if (!lockResult.acquired) {
      return apiJson({ ok: true, skipped: "lock-held" });
    }
    return apiJson(lockResult.value);
  } catch (e) {
    await sendCronFailureAlert("billing", e);
    return apiInternalError("Billing cron failed");
  }
}

async function runBillingCron(supabase: ReturnType<typeof createServiceRoleAdmin>) {
  const today = new Date().toISOString().slice(0, 10);
  let overdueUpdated = 0;
  let remindersSent = 0;

  // ─── 1. Auto-detect overdue ───
  try {
    const { data: overdueInvoices } = await supabase
      .from("documents")
      .select("id")
      .in("doc_type", ["invoice", "consolidated_invoice"])
      .eq("status", "sent")
      .lt("due_date", today)
      .not("due_date", "is", null);

    if (overdueInvoices && overdueInvoices.length > 0) {
      const ids = overdueInvoices.map((inv) => inv.id);
      const { count } = await supabase
        .from("documents")
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .in("id", ids);
      overdueUpdated = count ?? ids.length;
    }
  } catch (e) {
    console.error("[cron/billing] overdue detection failed:", e);
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException(e, { tags: { cron: "billing", phase: "overdue_detection" } }))
      .catch(() => {});
  }

  // ─── 2. Send reminders ───
  try {
    // Find overdue invoices (3 days past due) that haven't been reminded yet
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

    const { data: overdueForReminder } = await supabase
      .from("documents")
      .select("id, tenant_id, customer_id, doc_number, total, due_date")
      .in("doc_type", ["invoice", "consolidated_invoice"])
      .eq("status", "overdue")
      .lte("due_date", threeDaysAgoStr);

    if (overdueForReminder && overdueForReminder.length > 0) {
      // Batch fetch: notification_logs, customers, tenants
      const invIds = overdueForReminder.map((inv) => inv.id);
      const customerIds = [...new Set(overdueForReminder.map((inv) => inv.customer_id).filter(Boolean))] as string[];
      const tenantIds = [...new Set(overdueForReminder.map((inv) => inv.tenant_id).filter(Boolean))] as string[];

      const [{ data: existingLogs }, { data: customers }, { data: tenants }] = await Promise.all([
        supabase
          .from("notification_logs")
          .select("target_id")
          .eq("target_type", "invoice")
          .eq("type", "overdue_reminder")
          .in("target_id", invIds),
        supabase.from("customers").select("id, name, email").in("id", customerIds),
        supabase.from("tenants").select("id, name").in("id", tenantIds),
      ]);

      const notifiedSet = new Set((existingLogs ?? []).map((l) => l.target_id));
      const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));
      const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

      for (const inv of overdueForReminder) {
        if (notifiedSet.has(inv.id)) continue;
        if (!inv.customer_id) continue;

        const customer = customerMap.get(inv.customer_id);
        if (!customer?.email) continue;

        const shopName = tenantMap.get(inv.tenant_id)?.name ?? "施工店";
        const html = wrapEmail(
          "お支払いのお願い",
          `
            <p style="color: #1d1d1f; font-size: 14px;">
              ${customer.name} 様<br><br>
              ${shopName}より、請求書 <strong>${inv.doc_number}</strong> のお支払い期限が過ぎております。
            </p>
            <div style="background: #fff3cd; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #856404;">
              請求額: <strong>¥${(inv.total ?? 0).toLocaleString("ja-JP")}</strong><br>
              お支払期限: <strong>${inv.due_date}</strong>
            </div>
            <p style="font-size: 13px; color: #86868b;">お心当たりがない場合は、お手数ですが ${shopName} までお問い合わせください。</p>
          `,
        );

        const sent = await sendReminderEmail(customer.email, `[${shopName}] お支払いのお願い: ${inv.doc_number}`, html);

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
    }

    // Find invoices due in 7 days
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);

    const { data: dueSoonInvoices } = await supabase
      .from("documents")
      .select("id, tenant_id, customer_id, doc_number, total, due_date")
      .in("doc_type", ["invoice", "consolidated_invoice"])
      .eq("status", "sent")
      .eq("due_date", sevenDaysLaterStr);

    if (dueSoonInvoices && dueSoonInvoices.length > 0) {
      // Batch fetch for due-soon invoices
      const invIds = dueSoonInvoices.map((inv) => inv.id);
      const customerIds = [...new Set(dueSoonInvoices.map((inv) => inv.customer_id).filter(Boolean))] as string[];
      const tenantIds = [...new Set(dueSoonInvoices.map((inv) => inv.tenant_id).filter(Boolean))] as string[];

      const [{ data: existingLogs }, { data: customers }, { data: tenants }] = await Promise.all([
        supabase
          .from("notification_logs")
          .select("target_id")
          .eq("target_type", "invoice")
          .eq("type", "due_soon")
          .in("target_id", invIds),
        supabase.from("customers").select("id, name, email").in("id", customerIds),
        supabase.from("tenants").select("id, name").in("id", tenantIds),
      ]);

      const notifiedSet = new Set((existingLogs ?? []).map((l) => l.target_id));
      const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));
      const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

      for (const inv of dueSoonInvoices) {
        if (notifiedSet.has(inv.id)) continue;
        if (!inv.customer_id) continue;

        const customer = customerMap.get(inv.customer_id);
        if (!customer?.email) continue;

        const shopName = tenantMap.get(inv.tenant_id)?.name ?? "施工店";
        const html = wrapEmail(
          "お支払期限のご案内",
          `
            <p style="color: #1d1d1f; font-size: 14px;">
              ${customer.name} 様<br><br>
              ${shopName}より、請求書 <strong>${inv.doc_number}</strong> のお支払期限が近づいております。
            </p>
            <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
              請求額: <strong>¥${(inv.total ?? 0).toLocaleString("ja-JP")}</strong><br>
              お支払期限: <strong>${inv.due_date}</strong>
            </div>
          `,
        );

        const sent = await sendReminderEmail(
          customer.email,
          `[${shopName}] お支払期限のご案内: ${inv.doc_number}`,
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
    }
  } catch (e) {
    console.error("[cron/billing] reminder sending failed:", e);
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException(e, { tags: { cron: "billing", phase: "reminder_sending" } }))
      .catch(() => {});
  }

  return {
    ok: true,
    overdue_updated: overdueUpdated,
    reminders_sent: remindersSent,
    date: today,
  };
}
