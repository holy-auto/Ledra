/**
 * ワークフローの「検査」工程に到達した時点で、その予約に紐づく塗膜厚レポートに
 * 異常検知を自動適用する IO 層。
 *
 * 設計:
 *   - opt-in (`thickness.auto_detect`) + Standard+ (ai_thickness_anomaly) + is_active
 *   - thicknessAuto.maybeAutoDetectThicknessForReports に委譲（処理の重複を避ける）
 *   - 対象: reservation に紐づく未処理レポート（ai_anomaly_result が null）を最大取得
 *   - 壁3 とは無関係 (stats/severity/comment は注釈のみ)
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoDetectThickness } from "./orchestrator";
import { maybeAutoDetectThicknessForReports } from "./thicknessAuto";

const MAX_REPORTS_PER_INSPECTION = 10;

export async function maybeAutoDetectThicknessForReservation(params: {
  tenantId: string;
  reservationId: string;
}): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoDetectThickness(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-detect thickness — inspection workflow step");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_thickness_anomaly")) return;

    // reservation の vehicle_id を取得
    const { data: reservation } = await admin
      .from("reservations")
      .select("vehicle_id")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!reservation?.vehicle_id) return;

    // reservation_id 直結のレポートを優先、無ければ vehicle_id で直近を取る
    const { data: byReservation } = await admin
      .from("thickness_reports")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("reservation_id", reservationId)
      .is("ai_anomaly_result", null)
      .order("created_at", { ascending: false })
      .limit(MAX_REPORTS_PER_INSPECTION);

    let reportIds = (byReservation ?? []).map((r) => r.id as string);

    if (reportIds.length === 0) {
      // フォールバック: 同車両の当日以内のレポート
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data: byVehicle } = await admin
        .from("thickness_reports")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("vehicle_id", reservation.vehicle_id)
        .is("ai_anomaly_result", null)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(MAX_REPORTS_PER_INSPECTION);
      reportIds = (byVehicle ?? []).map((r) => r.id as string);
    }

    if (reportIds.length === 0) return;

    await maybeAutoDetectThicknessForReports({ tenantId, reportIds });
    logger.info("[thicknessStepAuto] anomaly detection triggered", {
      tenantId,
      reservationId,
      count: reportIds.length,
    });
  } catch (e) {
    logger.warn("[thicknessStepAuto] maybeAutoDetectThicknessForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
