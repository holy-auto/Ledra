import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { todayJst } from "@/lib/gantt/board";
import { addDays } from "@/lib/booking/slots";
import { sanitizeAutoActions } from "@/lib/ai/automation/actionCatalog";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation } from "@/lib/ai/automation/policy";
import { shouldSendDayBeforeReminder } from "@/lib/ai/automation/orchestrator";
import { processDayBeforeReminders } from "@/lib/cron/reservationReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const REMINDER_KEY = "reservation.auto_day_before_reminder";

/**
 * 予約前日リマインダー Cron。翌日 (JST) に予約があるお客様へ、前日夕方に LINE で
 * リマインダー (opt-in 済みなら self-cancel/self-reschedule ボタン付き) を送る。
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const admin = createServiceRoleAdmin("cron:reservation-reminders — iterates opted-in tenants");
    // 翌日 (JST) の暦日を対象にする。Vercel(UTC) の実行でも JST の今日+1 を使う。
    const targetDate = addDays(todayJst(), 1);

    const lock = await withCronLock(admin, "reservation-reminders", 600, async () => {
      let sent = 0;
      try {
        // opt-in 候補を安価に絞る (auto_actions にキーが true のテナントのみ)。権威判定は
        // loadAiAutomationSettings + shouldSendDayBeforeReminder (enabled 込み) で行う。
        const { data: rows } = await admin.from("tenant_ai_automation_settings").select("tenant_id, auto_actions");
        const candidates = ((rows as Array<{ tenant_id: string; auto_actions: unknown }> | null) ?? []).filter(
          (r) => sanitizeAutoActions(r.auto_actions)[REMINDER_KEY] === true,
        );

        for (const { tenant_id } of candidates) {
          const settings = await loadAiAutomationSettings(tenant_id);
          if (!shouldSendDayBeforeReminder(settings)) continue;
          if (!(await tenantEligibleForAiAutomation(admin, tenant_id))) continue;
          sent += await processDayBeforeReminders(admin, { tenantId: tenant_id, settings, targetDate });
        }
      } catch (e) {
        console.error("[cron/reservation-reminders] failed:", e);
      }
      return sent;
    });

    if (!lock.acquired) {
      return apiJson({ ok: true, skipped: "lock-held", target_date: targetDate });
    }
    return apiJson({ ok: true, reminders_sent: lock.value, target_date: targetDate });
  } catch (e) {
    await sendCronFailureAlert("reservation-reminders", e);
    return apiInternalError("Reservation reminders cron failed");
  }
}
