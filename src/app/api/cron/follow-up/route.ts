import { NextRequest, NextResponse } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import {
  type FollowUpSetting,
  type TenantInfo,
  processExpiryReminders,
  processRegularFollowUps,
  processPostIssueFollowUps,
  processFirstReminderFollowUps,
  processWarrantyEndFollowUps,
  processSeasonalProposals,
  processMaintenanceReminders,
} from "@/lib/cron/followUp";
import { todayJst } from "@/lib/gantt/board";
import { processInspectionReminders } from "@/lib/cron/inspectionReminders";
import { processServiceReminders } from "@/lib/cron/serviceReminders";
import { processBirthdayGreetings } from "@/lib/cron/birthdayGreetings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Follow-up Cron Job（拡張版）
 * 1. 有効期限リマインダー
 * 2. 施工後フォローアップ: 90日・180日 ＋ 発行直後・30日・保証終了前
 * 3. 季節提案（10〜11月: 冬前, 5〜6月: 梅雨前）
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const supabase = createServiceRoleAdmin("cron:follow-up — iterates every tenant's follow_up_settings");
    // 「今日」は JST の暦日で統一する。Vercel (UTC) では JST 深夜の実行時に
    // toISOString() ベースの日付計算が前日にずれるため、JST の今日を UTC 0 時に
    // 固定した Date を全サブジョブへ渡す (各サブジョブは getUTC* / toISOString で読む)。
    const todayStr = todayJst();
    const today = new Date(`${todayStr}T00:00:00Z`);

    const lock = await withCronLock(supabase, "follow-up", 600, async () => {
      let remindersSent = 0;
      let followUpsSent = 0;
      let seasonalSent = 0;
      let maintenanceSent = 0;
      let inspectionSent = 0;
      let serviceReminderSent = 0;
      let birthdaySent = 0;
      try {
        const { data: rawSettings } = await supabase
          .from("follow_up_settings")
          .select(
            "tenant_id, reminder_days_before, follow_up_days_after, enabled, send_on_issue, first_reminder_days, warranty_end_days, inspection_pre_days, seasonal_enabled, maintenance_reminder_months, maintenance_schedule_by_service, birthday_enabled, birthday_lead_days",
          )
          .eq("enabled", true);
        const settings = (rawSettings ?? []) as unknown as FollowUpSetting[];

        if (settings.length) {
          const allTenantIds = [...new Set(settings.map((s) => s.tenant_id))];
          const { data: tenants } = (await supabase
            .from("tenants")
            .select("id, name, phone, plan_tier")
            .in("id", allTenantIds)) as { data: TenantInfo[] | null };
          const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

          for (const setting of settings) {
            const tenant = tenantMap.get(setting.tenant_id);
            if (!tenant) continue;

            const shopName = tenant.name ?? "施工店";
            const planTier = normalizePlanTier(tenant.plan_tier);

            remindersSent += await processExpiryReminders(supabase, setting, shopName, today);
            followUpsSent += await processRegularFollowUps(supabase, setting, tenant, shopName, planTier, today);
            followUpsSent += await processPostIssueFollowUps(supabase, setting, tenant, shopName, planTier, todayStr);
            followUpsSent += await processFirstReminderFollowUps(supabase, setting, tenant, shopName, planTier, today);
            followUpsSent += await processWarrantyEndFollowUps(supabase, setting, tenant, shopName, planTier);
            seasonalSent += await processSeasonalProposals(supabase, setting, shopName, today);
            maintenanceSent += await processMaintenanceReminders(supabase, setting, tenant, shopName, planTier, today);
            inspectionSent += await processInspectionReminders(supabase, setting, shopName, today);
            serviceReminderSent += await processServiceReminders(supabase, setting, shopName, today);
            birthdaySent += await processBirthdayGreetings(supabase, setting, shopName, today);
          }
        }
      } catch (e) {
        console.error("[cron/follow-up] failed:", e);
      }
      return {
        remindersSent,
        followUpsSent,
        seasonalSent,
        maintenanceSent,
        inspectionSent,
        serviceReminderSent,
        birthdaySent,
      };
    });

    if (!lock.acquired) {
      return apiJson({ ok: true, skipped: "lock-held", date: todayStr });
    }

    return apiJson({
      ok: true,
      reminders_sent: lock.value.remindersSent,
      follow_ups_sent: lock.value.followUpsSent,
      seasonal_sent: lock.value.seasonalSent,
      maintenance_sent: lock.value.maintenanceSent,
      inspection_sent: lock.value.inspectionSent,
      service_reminder_sent: lock.value.serviceReminderSent,
      birthday_sent: lock.value.birthdaySent,
      date: todayStr,
    });
  } catch (e) {
    await sendCronFailureAlert("follow-up", e);
    return apiInternalError("Follow-up cron failed");
  }
}
