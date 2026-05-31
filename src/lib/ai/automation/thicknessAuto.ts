/**
 * 塗膜厚レポート受信時に異常検知を、人の操作なしで自動実行する IO 層。
 *
 * NexPTG 同期ルート (`/api/external/nexptg/sync` POST) から、レスポンス送出後に
 * `after()` 経由で **fire-and-forget** で呼ばれる (serverless でも完走させる)。
 * webhook 同様に auth セッションが無いので service-role で読み書きし、絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし thickness.auto_detect が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_thickness_anomaly) と is_active を確認
 *   3. レポートごとに測定値を集計し detectThicknessAnomaly を実行、
 *      thickness_reports.ai_anomaly_result に保存
 *
 * 壁3 とは無関係 (stats/severity/comment は注釈のみ)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { detectThicknessAnomaly, type ThicknessMeasurement } from "@/lib/ai/thicknessAnomaly";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoDetectThickness } from "./orchestrator";

const AUTO_ANOMALY_ENDPOINT = "/api/external/nexptg/sync#auto-anomaly";

/** 1 回の sync で AI 異常検知にかけるレポート数の上限 (暴走防止)。 */
const MAX_REPORTS_PER_RUN = 50;

export interface MaybeAutoDetectThicknessParams {
  tenantId: string;
  /** 今回 upsert された thickness_reports.id の配列。 */
  reportIds: string[];
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 受信した塗膜厚レポート群に異常検知を自動適用する。失敗しても投げない。
 */
export async function maybeAutoDetectThicknessForReports(params: MaybeAutoDetectThicknessParams): Promise<void> {
  const { tenantId, reportIds } = params;
  try {
    if (!Array.isArray(reportIds) || reportIds.length === 0) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoDetectThickness(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-detect thickness anomaly — nexptg webhook lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_thickness_anomaly")) return;

    const targets = reportIds.slice(0, MAX_REPORTS_PER_RUN);
    for (const reportId of targets) {
      await detectForReport(admin, tenantId, reportId);
    }
  } catch (e) {
    logger.warn("[thicknessAuto] maybeAutoDetectThicknessForReports threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

async function detectForReport(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
  reportId: string,
): Promise<void> {
  const { data: report } = await admin
    .from("thickness_reports")
    .select("id, name, brand, model")
    .eq("id", reportId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!report) return;

  const { data: measurements } = await admin
    .from("thickness_measurements")
    .select("value_um, place_id, section")
    .eq("report_id", reportId)
    .eq("tenant_id", tenantId);

  const measurementList: ThicknessMeasurement[] = (measurements ?? [])
    .filter((m) => typeof m.value_um === "number")
    .map((m) => ({
      value: m.value_um as number,
      location: [m.place_id, m.section].filter(Boolean).join(" "),
    }));

  // 測定値が無ければ何もしない (空レポート)。
  if (measurementList.length === 0) return;

  const usage = startAiRouteUsage(AUTO_ANOMALY_ENDPOINT);
  const result = await detectThicknessAnomaly({
    measurements: measurementList,
    serviceName: [report.name, report.brand, report.model].filter(Boolean).join(" ") || null,
  });

  const snapshot = {
    stats: result.stats,
    severity: result.severity,
    comment: result.comment,
    ai: result.ai,
    auto: true,
    generated_at: new Date().toISOString(),
  };

  const { error: upErr } = await admin
    .from("thickness_reports")
    .update({ ai_anomaly_result: snapshot })
    .eq("id", reportId)
    .eq("tenant_id", tenantId);
  if (upErr && !isMissingColumnError(upErr)) {
    logger.warn("[thicknessAuto] anomaly result update failed", { tenantId, err: upErr.message });
  }

  usage.record({
    tenantId,
    outcome: "ok",
    confidence: null,
    meta: { auto: true, severity: result.severity, ai: result.ai },
  });
}
