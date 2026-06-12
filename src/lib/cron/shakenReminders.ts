/**
 * 車検満了 LINE リマインダー処理。
 *
 * 既存の `processInspectionReminders` (src/lib/cron/inspectionReminders.ts) は
 * `follow_up_settings.inspection_pre_days` ピッタリの日 (±0 日) にメールを
 * 送る方式。本モジュールはそれと相補的に、
 *
 *   - 車検満了日が「今日 + 30 日 〜 今日 + 60 日」の範囲にある車両
 *   - かつ顧客が LINE 連携済み (customers.line_user_id あり)
 *
 * に対して LINE Push でリマインダーを送る。SMS / メールはスコープ外
 * (メールは inspectionReminders、一斉配信は broadcast 機能が担う)。
 *
 * 二重送信防止:
 *   - notification_logs (type = "shaken_line_reminder") に当該車両 +
 *     当該車検期 (expiry_date) の送信記録があればスキップ。
 *     -> 日次 cron が範囲スキャンするため「1 期 1 回」を保証する。
 *   - 送信後は vehicles.inspection_reminder_sent_at も now() に更新する
 *     (ダッシュボードの「最終リマインダー」表示用)。
 *
 * email 側 (inspectionReminders) と sent_at カラムを共有するが、送信可否は
 * それぞれ独立の notification_logs type で判定するため衝突しない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMaintenanceLineMessage } from "@/lib/line/client";

/** 車検満了 N 日前から拾い始める下限 (今日 + 30 日)。 */
const WINDOW_FROM_DAYS = 30;
/** 車検満了 N 日前まで拾う上限 (今日 + 60 日)。 */
const WINDOW_TO_DAYS = 60;

const NOTIF_TYPE = "shaken_line_reminder";

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_id: string | null;
  inspection_expiry_date: string;
};

type CustomerRow = {
  id: string;
  name: string | null;
  line_user_id: string | null;
};

function addDaysStr(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(baseStr: string, targetStr: string): number {
  const b = Date.parse(`${baseStr}T00:00:00Z`);
  const t = Date.parse(`${targetStr}T00:00:00Z`);
  return Math.round((t - b) / 86_400_000);
}

function buildVehicleLabel(v: { maker: string | null; model: string | null; year: number | null }): string {
  const parts = [v.maker, v.model, v.year].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "お車";
}

function buildMessage(params: {
  shopName: string;
  customerName: string;
  vehicleLabel: string;
  plateDisplay: string | null;
  expiryDate: string;
  daysUntil: number;
}): string {
  const lines: string[] = [
    `【車検満了のお知らせ】${params.shopName}`,
    ``,
    `${params.customerName} 様`,
    ``,
    `下記のお車の車検満了日が近づいています。`,
    `🚗 ${params.vehicleLabel}`,
  ];
  if (params.plateDisplay) lines.push(`🔢 ${params.plateDisplay}`);
  lines.push(
    `📅 車検満了日: ${params.expiryDate} (あと ${params.daysUntil} 日)`,
    ``,
    `お早めの車検予約をおすすめします。ご相談はお気軽にご連絡ください。`,
  );
  return lines.join("\n");
}

/**
 * 車検満了 LINE リマインダーを処理する。
 *
 * @param supabase service-role client (cron 用、全テナント横断)
 * @param tenantId 対象テナント
 * @param shopName 店舗名 (メッセージ本文用)
 * @param today    実行基準日
 * @returns 送信成功件数
 */
export async function processShakenReminders(
  supabase: SupabaseClient,
  tenantId: string,
  shopName: string,
  today: Date,
): Promise<number> {
  const todayStr = today.toISOString().slice(0, 10);
  const from = addDaysStr(today, WINDOW_FROM_DAYS); // 今日 + 30 日
  const to = addDaysStr(today, WINDOW_TO_DAYS); // 今日 + 60 日

  const { data: rawVehicles, error } = await supabase
    .from("vehicles")
    .select("id, maker, model, year, plate_display, customer_id, inspection_expiry_date")
    .eq("tenant_id", tenantId)
    .not("inspection_expiry_date", "is", null)
    .gte("inspection_expiry_date", from)
    .lte("inspection_expiry_date", to);
  if (error) return 0;

  const vehicles = ((rawVehicles ?? []) as VehicleRow[]).filter((v) => v.customer_id);
  if (vehicles.length === 0) return 0;

  // 顧客 (line_user_id 必須) を解決。
  const customerIds = [...new Set(vehicles.map((v) => v.customer_id).filter(Boolean))] as string[];
  const { data: rawCustomers } = await supabase
    .from("customers")
    .select("id, name, line_user_id")
    .eq("tenant_id", tenantId)
    .in("id", customerIds);
  const customerMap = new Map<string, CustomerRow>();
  for (const c of (rawCustomers ?? []) as CustomerRow[]) customerMap.set(c.id, c);

  // 既に送信済み (= notification_logs に当該車両の記録あり) の車両を弾く。
  const vehicleIds = vehicles.map((v) => v.id);
  const { data: existingLogs } = await supabase
    .from("notification_logs")
    .select("target_id")
    .eq("tenant_id", tenantId)
    .eq("type", NOTIF_TYPE)
    .in("target_id", vehicleIds);
  const alreadySent = new Set((existingLogs ?? []).map((l) => (l as { target_id: string }).target_id));

  let sent = 0;
  for (const v of vehicles) {
    if (alreadySent.has(v.id)) continue;
    const customer = v.customer_id ? customerMap.get(v.customer_id) : null;
    const lineUserId = customer?.line_user_id ?? null;
    if (!lineUserId) continue; // LINE 未連携はスキップ (メール/SMS はスコープ外)

    const daysUntil = daysBetween(todayStr, v.inspection_expiry_date);
    const ok = await sendMaintenanceLineMessage({
      tenantId,
      lineUserId,
      lineMessage: buildMessage({
        shopName,
        customerName: customer?.name ?? "お客様",
        vehicleLabel: buildVehicleLabel(v),
        plateDisplay: v.plate_display,
        expiryDate: v.inspection_expiry_date,
        daysUntil,
      }),
    });

    // 結果に関わらず記録を残す (失敗時は status=failed、再送ループ防止)。
    await supabase.from("notification_logs").insert({
      tenant_id: tenantId,
      type: NOTIF_TYPE,
      target_type: "vehicle",
      target_id: v.id,
      recipient_line_user_id: lineUserId,
      status: ok ? "sent" : "failed",
    });

    // ダッシュボードの「最終リマインダー」表示用に sent_at を更新。
    await supabase.from("vehicles").update({ inspection_reminder_sent_at: new Date().toISOString() }).eq("id", v.id);

    if (ok) sent++;
  }

  return sent;
}
