/**
 * 定期点検・交換時期リマインダー処理。
 *
 * `service_reminders` (next_due_date / next_due_mileage は GENERATED 列) のうち、
 * 期日・走行距離が近い active な提案に対して、顧客へ LINE / メールで点検・交換
 * 時期の案内を送る。
 *
 *  - 期間軸 (reminder_type = interval_months / both): next_due_date が
 *    today 〜 today+PRE_DAYS に入っていれば案内する。
 *  - 距離軸 (reminder_type = mileage / both): 車両の最新走行距離
 *    (`vehicle_mileage_logs` の最大 mileage_km) が next_due_mileage - PRE_KM 以上
 *    (＝あと PRE_KM 以内 もしくは超過) に達していれば案内する。
 *
 * `both` は片方の軸でも到達していれば 1 回だけ案内する (notified_at は 1 つなので
 * 二重送信にはならない)。
 *
 * 重複送信防止: 送信したら `service_reminders.notified_at` をセットし、
 * `notified_at IS NULL` のものだけを対象にする (失敗時も notified_at を立て、
 * 同じ理由で延々と再送するループを防ぐ。結果は notification_logs で追える)。
 * 次サイクル (完了登録 → 直近施工値を更新した新規リマインダーを起票) では、
 * 新規行の notified_at が NULL なので再度 1 回送れる。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendServiceReminderEmail } from "@/lib/follow-up/email";
import { sendMaintenanceLineMessage } from "@/lib/line/client";

/** next_due_date が「今日から何日後まで」に入っていたら案内するか。 */
const PRE_DAYS = 14;
/** next_due_mileage まで「あと何 km 以内」に入っていたら案内するか (超過分も含む)。 */
const PRE_KM = 5000;

type ReminderRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_name: string;
  reminder_type: "mileage" | "interval_months" | "both";
  next_due_date: string | null;
  next_due_mileage: number | null;
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

/** 到達した軸に応じて案内文に差し込む時期の文言を組み立てる (期日優先)。 */
function buildTiming(r: ReminderRow, dateDue: boolean, mileageDue: boolean): string {
  if (dateDue && r.next_due_date) return `${r.next_due_date}頃`;
  if (mileageDue && r.next_due_mileage != null) return `走行 ${r.next_due_mileage.toLocaleString("ja-JP")}km 到達目安`;
  // どちらの軸も該当しない呼び出しは想定外だが、フォールバックを返す。
  return r.next_due_date ? `${r.next_due_date}頃` : "まもなく";
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
  const dateCeil = toDateString(addDays(today, PRE_DAYS));

  // active かつ未通知で、いずれかの推奨時期 (期日 or 走行距離) が算出済みのもの。
  // 軸ごとの到達判定 (距離は車両の現走行距離との突き合わせが要る) は app 層で行う。
  const { data: rawReminders, error } = await supabase
    .from("service_reminders")
    .select("id, customer_id, vehicle_id, service_name, reminder_type, next_due_date, next_due_mileage")
    .eq("tenant_id", setting.tenant_id)
    .eq("status", "active")
    .is("notified_at", null)
    .or("next_due_date.not.is.null,next_due_mileage.not.is.null");

  if (error) {
    console.error("[service-reminder] select failed:", error.message);
    return 0;
  }

  const candidates = (rawReminders ?? []) as ReminderRow[];
  if (candidates.length === 0) return 0;

  // 車両の最新走行距離 (vehicle_mileage_logs の最大 mileage_km) と表示用車両情報を取得。
  const vehicleIds = [...new Set(candidates.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const currentMileage = new Map<string, number>();
  const vehicleMap = new Map<string, VehicleRow>();
  if (vehicleIds.length > 0) {
    const { data: logs } = (await supabase
      .from("vehicle_mileage_logs")
      .select("vehicle_id, mileage_km")
      .eq("tenant_id", setting.tenant_id)
      .in("vehicle_id", vehicleIds)) as { data: Array<{ vehicle_id: string; mileage_km: number }> | null };
    for (const row of logs ?? []) {
      const prev = currentMileage.get(row.vehicle_id);
      if (prev == null || row.mileage_km > prev) currentMileage.set(row.vehicle_id, row.mileage_km);
    }

    const { data: vehicles } = (await supabase
      .from("vehicles")
      .select("id, maker, model, year, plate_display")
      .in("id", vehicleIds)) as { data: VehicleRow[] | null };
    for (const v of vehicles ?? []) vehicleMap.set(v.id, v);
  }

  // 到達した軸を判定し、案内対象だけに絞る。
  const due = candidates
    .map((r) => {
      const dateDue = r.reminder_type !== "mileage" && r.next_due_date != null && r.next_due_date <= dateCeil;
      const curKm = r.vehicle_id ? currentMileage.get(r.vehicle_id) : undefined;
      const mileageDue =
        r.reminder_type !== "interval_months" &&
        r.next_due_mileage != null &&
        curKm != null &&
        curKm >= r.next_due_mileage - PRE_KM;
      return { r, dateDue, mileageDue };
    })
    .filter((x) => x.dateDue || x.mileageDue);
  if (due.length === 0) return 0;

  // 顧客を一括解決。
  const customerIds = [...new Set(due.map((x) => x.r.customer_id).filter(Boolean))] as string[];
  const customerMap = new Map<string, CustomerRow>();
  if (customerIds.length > 0) {
    const { data: customers } = (await supabase
      .from("customers")
      .select("id, name, email, line_user_id, followup_opt_out")
      .in("id", customerIds)) as { data: CustomerRow[] | null };
    for (const c of customers ?? []) customerMap.set(c.id, c);
  }

  let sent = 0;
  for (const { r, dateDue, mileageDue } of due) {
    if (!r.customer_id) continue;
    const customer = customerMap.get(r.customer_id);
    if (!customer) continue;
    if (customer.followup_opt_out) continue;
    // LINE / email のいずれかが届けられないと送れない
    if (!customer.line_user_id && !customer.email) continue;

    const customerName = customer.name ?? "お客様";
    const vehicleLabel = buildVehicleLabel(r.vehicle_id ? vehicleMap.get(r.vehicle_id) : undefined);
    const timing = buildTiming(r, dateDue, mileageDue);

    let ok = false;
    let channel: "line" | "email" = "email";
    let recipientEmail: string | null = null;
    let recipientLineUserId: string | null = null;

    if (customer.line_user_id) {
      const lineMessage =
        `${shopName}です。${customerName}様\n` +
        `${vehicleLabel ? `${vehicleLabel}の` : "お車の"}「${r.service_name}」の点検・交換時期（${timing}）が近づいています。\n` +
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
        timing,
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
