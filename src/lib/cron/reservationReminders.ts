/**
 * 予約前日リマインダー (reservation.auto_day_before_reminder)。
 *
 * 翌日 (JST) に未キャンセル予約があり、line_user_id 紐付け済み・フォローアップ拒否でない
 * お客様へ、前日に LINE で「明日ご予約です」を送る。self-cancel / self-reschedule の opt-in が
 * ON なら、そのままキャンセル/日程変更できるボタン (flow:start_cancel / flow:start_reschedule) を
 * 添える (タップで handleFlowPostback が既存のセルフ対応フローを起動する)。
 *
 * 重複送信防止: 送信 (成功/失敗) のたびに notification_logs に type=reservation_reminder /
 * target_id=予約ID を残し、既にログのある予約はスキップする (cron の二重発火・再実行で
 * 二重送信しない)。cron は 1 日 1 回・前日夕方に走る想定で、失敗しても当日には間に合わないため
 * 翌日への持ち越し再送はしない (ログを残してスキップ扱いにする)。
 */
import type { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendCustomerLineButtons, sendCustomerLineText } from "@/lib/line/client";
import { buildReservationReminder, type CancelTargetReservation } from "@/lib/line/flow/messages";
import { shouldAutoSelfCancel, shouldAutoSelfReschedule } from "@/lib/ai/automation/orchestrator";
import type { AiAutomationSettings } from "@/lib/ai/automation/policy";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

type ReservationRow = {
  id: string;
  customer_id: string | null;
  scheduled_date: string;
  start_time: string | null;
  title: string | null;
  status: string | null;
};

type CustomerRow = {
  id: string;
  line_user_id: string | null;
  followup_opt_out: boolean | null;
};

/**
 * 1 テナントぶんの予約前日リマインダーを送る。呼び出し側 (cron route) が opt-in・プラン・
 * 有効性を確認済みである前提。失敗しても投げない。
 * @param targetDate 翌日 (JST) の暦日 YYYY-MM-DD。
 * @returns 送信成功件数。
 */
export async function processDayBeforeReminders(
  admin: Admin,
  params: { tenantId: string; settings: AiAutomationSettings; targetDate: string },
): Promise<number> {
  const { tenantId, settings, targetDate } = params;
  try {
    const { data: resvData, error: resvErr } = await admin
      .from("reservations")
      .select("id, customer_id, scheduled_date, start_time, title, status")
      .eq("tenant_id", tenantId)
      .eq("scheduled_date", targetDate)
      .neq("status", "cancelled")
      .neq("status", "completed");
    if (resvErr) {
      logger.warn("[reservationReminders] reservation select failed", { tenantId, err: resvErr.message });
      return 0;
    }
    const reservations = ((resvData as ReservationRow[] | null) ?? []).filter(
      (r) => r.customer_id && r.status !== "cancelled" && r.status !== "completed",
    );
    if (reservations.length === 0) return 0;

    // 既に前日リマインダーを送った予約は除外する (二重送信防止)。
    const reservationIds = reservations.map((r) => r.id);
    const { data: logRows } = await admin
      .from("notification_logs")
      .select("target_id")
      .eq("tenant_id", tenantId)
      .eq("type", "reservation_reminder")
      .in("target_id", reservationIds);
    const alreadySent = new Set(((logRows as Array<{ target_id: string }> | null) ?? []).map((l) => l.target_id));

    const pending = reservations.filter((r) => !alreadySent.has(r.id));
    if (pending.length === 0) return 0;

    // 顧客 (LINE 紐付け・拒否フラグ) を一括解決。
    const customerIds = [...new Set(pending.map((r) => r.customer_id).filter(Boolean))] as string[];
    const customerMap = new Map<string, CustomerRow>();
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, line_user_id, followup_opt_out")
        .eq("tenant_id", tenantId)
        .in("id", customerIds);
      for (const c of (customers as CustomerRow[] | null) ?? []) customerMap.set(c.id, c);
    }

    const withCancel = shouldAutoSelfCancel(settings);
    const withReschedule = shouldAutoSelfReschedule(settings);

    let sent = 0;
    for (const r of pending) {
      const customer = r.customer_id ? customerMap.get(r.customer_id) : undefined;
      // LINE 紐付けが無ければ送れない (前日リマインダーはボタン前提なのでメールにはしない)。
      if (!customer || !customer.line_user_id) continue;
      if (customer.followup_opt_out) continue;

      const target: CancelTargetReservation = {
        id: r.id,
        scheduled_date: r.scheduled_date,
        start_time: r.start_time,
        title: r.title,
      };
      const msg = buildReservationReminder(target, { withCancel, withReschedule });

      const ok =
        msg.buttons.length > 0
          ? await sendCustomerLineButtons({
              tenantId,
              customerId: r.customer_id,
              lineUserId: customer.line_user_id,
              text: msg.text,
              buttons: msg.buttons,
            })
          : await sendCustomerLineText({
              tenantId,
              customerId: r.customer_id,
              lineUserId: customer.line_user_id,
              body: msg.text,
            });

      // 結果に関わらずログを残して再送ループ/二重送信を防ぐ (失敗は logs で可視化)。
      await admin.from("notification_logs").insert({
        tenant_id: tenantId,
        type: "reservation_reminder",
        target_type: "reservation",
        target_id: r.id,
        recipient_line_user_id: customer.line_user_id,
        channel: "line",
        status: ok ? "sent" : "failed",
      });

      if (ok) sent++;
    }
    return sent;
  } catch (e) {
    logger.warn("[reservationReminders] processDayBeforeReminders threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}
