/**
 * POST /api/admin/thickness-reports/[reportId]/ai-anomaly
 *
 * 塗膜厚レポートの計測値を統計解析 + AI コメント生成して返す。
 *
 * リクエストボディで `expected_range` (μm) を任意で渡せる。指定がなければ
 * 統計的な外れ値判定のみ。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { detectThicknessAnomaly } from "@/lib/ai/thicknessAnomaly";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  expected_range: z
    .object({ min: z.number().min(0).max(10000), max: z.number().min(0).max(10000) })
    .refine((v) => v.max > v.min, "max must be greater than min")
    .optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const usage = startAiRouteUsage("/api/admin/thickness-reports/[reportId]/ai-anomaly");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { reportId } = await ctx.params;
    if (!reportId) return apiNotFound("reportId required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_thickness_anomaly")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 塗膜厚異常検知は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled || resolveFieldPolicy(settings, "inventory.thickness_anomaly") === "manual") {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, anomaly: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    // thickness_reports は `service_name` ではなく `name` / `brand` / `model`
    // を持つ。AI 文章化用にはどちらでも良いので結合した形を渡す。
    const { data: report, error: rErr } = await admin
      .from("thickness_reports")
      .select("id, name, brand, model")
      .eq("id", reportId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (rErr) return apiInternalError(rErr, "thickness ai-anomaly: report");
    if (!report) return apiNotFound("thickness report not found");

    // thickness_measurements は `location` ではなく place_id + section の 2 段。
    // AI 説明文の文脈には "<place_id>/<section>" を投げる。
    const { data: rows } = await admin
      .from("thickness_measurements")
      .select("value_um, place_id, section")
      .eq("report_id", reportId);

    const measurements = (
      (rows ?? []) as Array<{ value_um: number | null; place_id: string | null; section: string | null }>
    )
      .map((r) => ({
        value: typeof r.value_um === "number" ? r.value_um : NaN,
        location: [r.place_id, r.section].filter(Boolean).join("/") || undefined,
      }))
      .filter((m) => Number.isFinite(m.value));

    if (measurements.length === 0) {
      return apiOk({
        ai_disabled: false,
        anomaly: {
          stats: { count: 0, mean: 0, stddev: 0, min: 0, max: 0, outliers: [], outOfRange: [] },
          severity: "ok",
          comment: "",
          ai: false,
        },
      });
    }

    const serviceName =
      [report.name as string | null, report.brand as string | null, report.model as string | null]
        .filter(Boolean)
        .join(" ") || null;

    const anomaly = await detectThicknessAnomaly(
      {
        measurements,
        expectedRange: parsed.data.expected_range,
        serviceName,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );
    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      meta: { severity: anomaly.severity, measurements: measurements.length, ai: anomaly.ai },
    });
    return apiOk({ ai_disabled: false, anomaly });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "thickness ai-anomaly");
  }
}
