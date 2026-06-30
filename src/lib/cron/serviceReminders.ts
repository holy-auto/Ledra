/**
 * 定期点検・交換時期リマインダー処理。
 *
 * `service_reminders` (next_due_date は GENERATED 列) のうち、期日が近い
 * (today 〜 today+PRE_DAYS) アクティブな提案に対して、顧客へ LINE / メールで
 * 点検・交換時期の案内を送る。距離ベース (mileage) は現走行距離の取得が要るため
 * 本処理の対象外とし、interval_months / both の日付到達分のみ扱う。
 *
 * 重複送信防止: 送信したら `service_reminders.notified_at` をセットし、
 * `notified_at IS NULL` のものだけを対象にする (失敗時も notified_at を立て、
 * 同じ理由で延々と再送するループを防ぐ。結果は notification_logs で追える)。
 * 次サイクル (再施工で last_service_date 更新 → next_due_date 更新) では、
 * アプリ側で notified_at を NULL に戻すことで再度 1 回送れる。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendServiceReminderEmail } from "@/lib/follow-up/email";
import { sendMaintenanceLineMessage } from "@/lib/line/client";

/** next_due_date が「今日から何日後まで」に入っていたら案内するか。 */
const PRE_DAYS = 14;

type ReminderRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_name: string;
  next_due_date: string;
};

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  line_user_id: string | null;
  followup_opt_out: boolean | null;
};

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function buildVehicleLabel(v: VehicleRow | undefined): string | null {
  if (!v) return null;
  const base = [v.maker, v.model, v.year].filter(Boolean).join(" ");
  if (!base && !v.plate_display) return null;
  return v.plate_display ? `${base || "車両"} / ${v.plate_display}` : base;
}

/**
 * 定期点検・交換時期リマインダーを処理する。
 * @returns 送信成功件数
 */
export async function processServiceReminders(
  supabase: SupabaseClient,
  setting: { tenant_id: string },
  shopName: string,
  today: Date,
): Promise<number> {
  const targetCeil = toDateString(addDays(today, PRE_DAYS));

  const { data: rawReminders, error } = await supabase
    .from("service_reminders")
    .select("id, customer_id, vehicle_id, service_name, next_due_date")
    .eq("tenant_id", setting.tenant_id)
    .eq("status", "active")
    .in("reminder_type", ["interval_months", "both"])
    .not("next_due_date", "is", null)
    .lte("next_due_date", targetCeil)
    .is("notified_at", null);

  if (error) {
    console.error("[service-reminder] select failed:", error.message);
    return 0;
  }

  const reminders = (rawReminders ?? []) as ReminderRow[];
  if (reminders.length === 0) return 0;

  // 顧客・車両を一括解決
  const customerIds = [...new Set(reminders.map((r) => r.customer_id).filter(Boolean))] as string[];
  const customerMap = new Map<string, CustomerRow>();
  if (customerIds.length > 0) {
    const { data: customers } = (await supabase
      .from("customers")
      .select("id, name, email, line_user_id, followup_opt_out")
      .in("id", customerIds)) as { data: CustomerRow[] | null };
    for (const c of customers ?? []) customerMap.set(c.id, c);
  }

  const vehicleIds = [...new Set(reminders.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const vehicleMap = new Map<string, VehicleRow>();
  if (vehicleIds.length > 0) {
    const { data: vehicles } = (await supabase
      .from("vehicles")
      .select("id, maker, model, year, plate_display")
      .in("id", vehicleIds)) as { data: VehicleRow[] | null };
    for (const v of vehicles ?? []) vehicleMap.set(v.id, v);
  }

  let sent = 0;
  for (const r of reminders) {
    if (!r.customer_id) continue;
    const customer = customerMap.get(r.customer_id);
    if (!customer) continue;
    if (customer.followup_opt_out) continue;
    // LINE / email のいずれかが届けられないと送れない
    if (!customer.line_user_id && !customer.email) continue;

    const customerName = customer.name ?? "お客様";
    const vehicleLabel = buildVehicleLabel(r.vehicle_id ? vehicleMap.get(r.vehicle_id) : undefined);

    let ok = false;
    let channel: "line" | "email" = "email";
    let recipientEmail: string | null = null;
    let recipientLineUserId: string | null = null;

    if (customer.line_user_id) {
      const lineMessage =
        `${shopName}です。${customerName}様\n` +
        `${vehicleLabel ? `${vehicleLabel}の` : "お車の"}「${r.service_name}」の点検・交換時期（${r.next_due_date}頃）が近づいています。\n` +
        `ご予約・ご相談はお気軽にどうぞ。`;
      const lineOk = await sendMaintenanceLineMessage({
        tenantId: setting.tenant_id,
        lineUserId: customer.line_user_id,
        lineMessage,
      });
      if (lineOk) {
        ok = true;
        channel = "line";
        recipientLineUserId = customer.line_user_id;
      }
    }

    if (!ok && customer.email) {
      ok = await sendServiceReminderEmail({
        shopName,
        customerEmail: customer.email,
        customerName,
        serviceName: r.service_name,
        vehicleLabel,
        dueDate: r.next_due_date,
      });
      channel = "email";
      recipientEmail = customer.email;
    }

    // 結果に関わらず notified_at を立てて再送ループを防ぐ (失敗は logs で可視化)。
    await supabase
      .from("service_reminders")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("tenant_id", setting.tenant_id);

    await supabase.from("notification_logs").insert({
      tenant_id: setting.tenant_id,
      type: "service_reminder",
      target_type: "service_reminder",
      target_id: r.id,
      recipient_email: recipientEmail,
      recipient_line_user_id: recipientLineUserId,
      channel,
      status: ok ? "sent" : "failed",
    });

    if (ok) sent++;
  }

  return sent;
}
