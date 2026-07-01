import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { loadAiAutomationSettings, resolveAutoAction } from "@/lib/ai/automation/policy";
import { sendProgressUpdate } from "@/lib/line/client";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { ensureBodyRepairTrackToken, TRACK_BASE_PATH } from "@/lib/bodyRepair/trackToken";
import { BODY_REPAIR_STAGES, BODY_REPAIR_STAGE_LABEL, type BodyRepairStage } from "@/lib/validations/body-repair-job";

export const BODY_REPAIR_STAGE_ADVANCE_ACTION = "body_repair.auto_notify_on_stage_advance";

/**
 * 鈑金 Kanban のステージが進んだとき、顧客へ LINE で進捗を自動通知する (opt-in)。
 *
 * 汎用予約は `reservations/[id]/advance` が通知するが、鈑金の stage は
 * `PATCH /api/admin/body-repair-jobs` という別経路で遷移するため、こちらに結線する。
 *
 * - テナントが `body_repair.auto_notify_on_stage_advance` を opt-in している場合のみ送信。
 * - 顧客に line_user_id が無ければ何もしない。
 * - fire-and-forget（呼び出し側は await 不要）。失敗は握りつぶしてログのみ。
 */
export async function maybeNotifyBodyRepairStageAdvance(params: {
  tenantId: string;
  jobId: string;
  customerId: string | null;
  stage: BodyRepairStage;
}): Promise<void> {
  const { tenantId, jobId, customerId, stage } = params;
  if (!customerId) return;

  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!resolveAutoAction(settings, BODY_REPAIR_STAGE_ADVANCE_ACTION)) return;

    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: customer } = await admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("tenant_id", tenantId)
      .eq("id", customerId)
      .maybeSingle();

    const lineUserId = customer?.line_user_id as string | null | undefined;
    if (!lineUserId) return;

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

    const totalSteps = BODY_REPAIR_STAGES.length;
    const index = BODY_REPAIR_STAGES.indexOf(stage);
    const currentStep = index >= 0 ? index + 1 : totalSteps;
    const progressPct = Math.round((currentStep / totalSteps) * 100);

    // この自動通知が手作業を置き換える対象は、まさに案件の進捗トラッキング URL
    // (/track/[token])。顧客ポータル (/customer/[slug]) は別物 (認証/別解決) なので使わない。
    const token = await ensureBodyRepairTrackToken(admin, tenantId, jobId);
    const portalUrl = token ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${TRACK_BASE_PATH}/${token}` : "";

    const delivered = await sendProgressUpdate({
      tenantId,
      lineUserId,
      customerName: (customer?.name as string | undefined) ?? "お客様",
      tenantName: tenant?.name ?? "施工店",
      stepLabel: BODY_REPAIR_STAGE_LABEL[stage],
      progressPct,
      currentStep,
      totalSteps,
      portalUrl,
    });
    if (delivered) {
      // 人の確認なしで顧客へ進捗を自動通知した事実を監査ログに残す (外向きアクション)。
      await logAutoActionExecuted({
        tenantId,
        actionKey: BODY_REPAIR_STAGE_ADVANCE_ACTION,
        resource: { kind: "body_repair_job", id: jobId },
        detail: { stage, customer_id: customerId, channel: "line" },
      });
    }
  } catch (error) {
    logger.warn("body-repair stage notify failed (non-blocking)", { error, tenantId, customerId });
  }
}
