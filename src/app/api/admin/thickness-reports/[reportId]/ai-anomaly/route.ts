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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { detectThicknessAnomaly } from "@/lib/ai/thicknessAnomaly";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";

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
  try {
    const { reportId } = await ctx.params;
    if (!reportId) return apiNotFound("reportId required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled || resolveFieldPolicy(settings, "inventory.thickness_anomaly") === "manual") {
      return apiOk({ ai_disabled: true, anomaly: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: report, error: rErr } = await admin
      .from("thickness_reports")
      .select("id, service_name")
      .eq("id", reportId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (rErr) return apiInternalError(rErr, "thickness ai-anomaly: report");
    if (!report) return apiNotFound("thickness report not found");

    const { data: rows } = await admin
      .from("thickness_measurements")
      .select("value_um, location")
      .eq("report_id", reportId);

    const measurements = ((rows ?? []) as Array<{ value_um: number | null; location: string | null }>)
      .map((r) => ({
        value: typeof r.value_um === "number" ? r.value_um : NaN,
        location: r.location ?? undefined,
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

    const anomaly = await detectThicknessAnomaly({
      measurements,
      expectedRange: parsed.data.expected_range,
      serviceName: (report.service_name as string | null) ?? null,
    });
    return apiOk({ ai_disabled: false, anomaly });
  } catch (e: unknown) {
    return apiInternalError(e, "thickness ai-anomaly");
  }
}
