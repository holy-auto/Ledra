/**
 * GET /api/admin/analytics/churn-risk?risk=high|medium|low&page=1
 *
 * 顧客離反リスク一覧 (上位 100 件を算出し、ページ 50 件で返す)。
 * 各行に AI 再来店提案 (Haiku) を付与する (返却ページ分のみ生成しコストを抑える)。
 *
 * AuthZ: 管理者 (admin) 以上。離反予測は経営判断に近く、line staff には開放しない。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  computeChurnRisk,
  generateChurnInsight,
  type ChurnRiskCustomer,
  type ChurnRiskLevel,
} from "@/lib/ai/churnPrediction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_PAGE = 50;
const VALID_RISK: ReadonlySet<ChurnRiskLevel> = new Set(["high", "medium", "low"] as const);

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この機能には管理者権限が必要です。");
    }

    const url = new URL(req.url);
    const riskParam = url.searchParams.get("risk");
    const riskFilter = riskParam && (VALID_RISK as Set<string>).has(riskParam) ? (riskParam as ChurnRiskLevel) : null;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const all = await computeChurnRisk(caller.tenantId);
    const filtered: ChurnRiskCustomer[] = riskFilter ? all.filter((c) => c.risk === riskFilter) : all;

    const total = filtered.length;
    const start = (page - 1) * PER_PAGE;
    const pageItems = filtered.slice(start, start + PER_PAGE);

    // 返却ページ分だけ AI 提案を生成 (並列・フェイルオープン)。
    const withInsight = await Promise.all(
      pageItems.map(async (c) => {
        const insight = await generateChurnInsight(
          { name: c.name },
          {
            visit_count: c.visit_count,
            days_since_last_visit: c.days_since_last_visit,
            avg_visit_interval_days: c.avg_visit_interval_days,
            risk: c.risk,
          },
        );
        return { ...c, ai_insight: insight };
      }),
    );

    return apiJson({
      ok: true,
      items: withInsight,
      page,
      per_page: PER_PAGE,
      total,
      risk: riskFilter,
      counts: {
        high: all.filter((c) => c.risk === "high").length,
        medium: all.filter((c) => c.risk === "medium").length,
        low: all.filter((c) => c.risk === "low").length,
      },
    });
  } catch (e) {
    return apiInternalError(e, "admin/analytics/churn-risk GET");
  }
}
