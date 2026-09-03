/**
 * POST /api/admin/accounting/ai-categorize
 *
 * 請求書明細を受け取り、勘定マスタ (freee / マネーフォワード) と
 * 突き合わせて科目コードを推定する。
 *
 * - accounts はクライアントが事前に取得した勘定マスタを渡す
 *   (本ルートは勘定 API を呼ばず純粋な推定ロジックに集中)
 * - 戻りの suggested_code はそのまま会計ソフトの仕訳作成 API に渡せる形
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { categorizeAccountingLines } from "@/lib/ai/accountingCategoryEstimate";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  fallback_code: z.string().min(1).max(40),
  accounts: z
    .array(
      z.object({
        code: z.string().min(1).max(40),
        label: z.string().min(1).max(120),
        keywords: z.array(z.string().min(1).max(40)).max(20).optional(),
      }),
    )
    .min(1)
    .max(200),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(200),
        amount: z.number().int(),
        is_reduced_rate: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/accounting/ai-categorize");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_accounting")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 仕訳科目推定は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({
        ai_disabled: true,
        lines: parsed.data.lines.map((l) => ({
          description: l.description,
          amount: l.amount,
          suggested_code: parsed.data.fallback_code,
          suggested_label: "未分類 (AI 自動入力 OFF)",
          confidence: 0,
          method: "fallback" as const,
        })),
      });
    }

    const result = await categorizeAccountingLines(parsed.data.lines, parsed.data.accounts, parsed.data.fallback_code, {
      model: fastModelForPlanTier(caller.planTier),
    });

    const methods = result.lines.reduce<Record<string, number>>((acc, l) => {
      acc[l.method] = (acc[l.method] ?? 0) + 1;
      return acc;
    }, {});
    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      meta: { method_counts: methods, lines: result.lines.length },
    });

    return apiOk({
      ai_disabled: false,
      lines: result.lines,
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "accounting ai-categorize");
  }
}
