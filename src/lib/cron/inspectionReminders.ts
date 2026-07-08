/**
 * 車検期日リマインダー処理。
 *
 * `vehicles.inspection_expiry_date` (車検満了日) が
 * `follow_up_settings.inspection_pre_days` (既定 60 日) 後の日付に
 * 一致する車両に対して、顧客にメール通知を送る。
 *
 * 重複送信防止:
 *   - 同一車検期 (= 同一 expiry_date) に対しては 1 回だけ送る
 *   - `vehicles.inspection_reminder_sent_at` に最終送信時刻を記録
 *   - 再送ロジック: expiry_date が更新されたら sent_at をリセットする運用
 *     (現状は手動 — 自動更新は将来検討。OCR 更新時に NULL に戻すと
 *     新しい車検期で 1 回送れる)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendInspectionReminder } from "@/lib/follow-up/email";

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  customer_id: string | null;
  inspection_expiry_date: string;
  inspection_reminder_sent_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
};

function buildVehicleLabel(v: { maker: string | null; model: string | null; year: number | null }): string {
  const parts = [v.maker, v.model, v.year].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "お車";
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 車検期日リマインダーを処理する。
 *
 * @returns 送信成功件数
 */
export async function processInspectionReminders(
  supabase: SupabaseClient,
  setting: { tenant_id: string; inspection_pre_days: number | null },
  shopName: string,
  today: Date,
): Promise<number> {
  const preDays = setting.inspection_pre_days;
  // null / 0 / 負の値はリマインダー無効
  if (!preDays || preDays <= 0) return 0;

  // 「今日から preDays 日後」を期限とする車両を探す。
  // 1 日ピッタリではなく、cron が日次で動く前提で「±0 日」のみ拾う。
  // (cron が落ちた日にリマインドを取り逃がす確率はあるが、二重送信を
  //  避けるトレードオフ。月次サマリで取り逃しを可視化する方針)
  const targetDate = toDateString(addDays(today, preDays));

  const { data: rawVehicles, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, maker, model, year, customer_id, inspection_expiry_date, inspection_reminder_sent_at")
    .eq("tenant_id", setting.tenant_id)
    .eq("inspection_expiry_date", targetDate);

  // SELECT が失敗したら静かに 0 件で終わらせず可視化する (過去にこの SELECT が
  // 削除済みカラムを参照していてリマインドが無言で止まっていた回帰を防ぐ)。
  if (vehErr) {
    console.error("[inspection-reminder] vehicles select failed:", vehErr.message);
    return 0;
  }

  const vehicles = (rawVehicles ?? []) as VehicleRow[];
  if (vehicles.length === 0) return 0;

  // 既に同じ車検期で送信済みの車両を弾く。
  //
  // 「同じ車検期」= sent_at が expiry_date より新しい AND
  //               sent_at が「今回ターゲットの 30 日以内」=
  //               日次 cron が滑った場合の余裕を持って 1 期 1 回保証する。
  //
  // 簡易には: sent_at が NULL のもののみ送る (= 期日更新時に NULL に
  // リセットする運用)。MVP はこれで十分。
  const pending = vehicles.filter((v) => v.inspection_reminder_sent_at === null);
  if (pending.length === 0) return 0;

  // 顧客連絡先は customers テーブルから解決する。
  // (customer_name/customer_email は vehicles から削除済み = 20260321000002。
  //  以前はそれらを SELECT していたためクエリが失敗し、リマインドが無言で止まっていた)
  const needCustomerLookup = [...new Set(pending.filter((v) => v.customer_id).map((v) => v.customer_id!))];
  const customerMap = new Map<string, CustomerRow>();
  if (needCustomerLookup.length > 0) {
    const { data: customers } = await supabase.from("customers").select("id, name, email").in("id", needCustomerLookup);
    for (const c of (customers ?? []) as CustomerRow[]) {
      customerMap.set(c.id, c);
    }
  }

  let sent = 0;
  for (const v of pending) {
    const customer = v.customer_id ? customerMap.get(v.customer_id) : null;
    const email = customer?.email ?? null;
    const name = customer?.name ?? "お客様";

    if (!email) continue;

    const ok = await sendInspectionReminder({
      shopName,
      customerEmail: email,
      customerName: name,
      vehicleLabel: buildVehicleLabel(v),
      expiryDate: v.inspection_expiry_date,
      daysUntil: preDays,
    });

    // 結果に関わらず sent_at を更新する (失敗の場合、次の日次 cron で再送
    // しても多くの場合同じ理由で失敗するため、ループ防止)。
    // 失敗は notification_logs から確認可能。
    await supabase.from("vehicles").update({ inspection_reminder_sent_at: new Date().toISOString() }).eq("id", v.id);

    await supabase.from("notification_logs").insert({
      tenant_id: setting.tenant_id,
      type: "inspection_reminder",
      target_type: "vehicle",
      target_id: v.id,
      recipient_email: email,
      status: ok ? "sent" : "failed",
    });

    if (ok) sent++;
  }

  return sent;
}
