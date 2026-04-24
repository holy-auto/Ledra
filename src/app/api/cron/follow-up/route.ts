import { NextRequest, NextResponse } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
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
} from "@/lib/cron/followUp";

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
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let remindersSent = 0;
    let followUpsSent = 0;
    let seasonalSent = 0;

    try {
      const { data: rawSettings } = await supabase
        .from("follow_up_settings")
        .select(
          "tenant_id, reminder_days_before, follow_up_days_after, enabled, send_on_issue, first_reminder_days, warranty_end_days, inspection_pre_days, seasonal_enabled",
        )
        .eq("enabled", true);
      const settings = (rawSettings ?? []) as unknown as FollowUpSetting[];

      if (!settings.length) {
        return apiJson({ ok: true, reminders_sent: 0, follow_ups_sent: 0, date: todayStr });
      }

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
      }
    } catch (e) {
      console.error("[cron/follow-up] failed:", e);
    }

    return apiJson({
      ok: true,
      reminders_sent: remindersSent,
      follow_ups_sent: followUpsSent,
      seasonal_sent: seasonalSent,
      date: todayStr,
    });
  } catch (e) {
    await sendCronFailureAlert("follow-up", e);
    return apiInternalError("Follow-up cron failed");
  }
}
