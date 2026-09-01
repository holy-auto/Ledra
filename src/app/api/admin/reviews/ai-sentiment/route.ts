/**
 * POST /api/admin/reviews/ai-sentiment
 *
 * 顧客レビュー (NPS 含む) のセンチメント解析 + 1 行サマリ + 話題タグ抽出。
 * 受信側 (Google レビュー / アンケート / 受領サインのコメント欄など) から
 * 来る生テキストを汎用に処理できるよう、ルートは ID 紐付け非依存にしている。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { analyzeReviewSentiment } from "@/lib/ai/reviewSentiment";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(8000),
  nps_score: z.number().int().min(0).max(10).optional(),
  days_since_certificate: z.number().int().min(0).max(3650).optional(),
});

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/reviews/ai-sentiment");
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
    if (!canUseFeature(caller.planTier, "ai_review_sentiment")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI レビュー解析は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, sentiment: null });
    }

    const result = await analyzeReviewSentiment(
      {
        text: parsed.data.text,
        npsScore: parsed.data.nps_score,
        daysSinceCertificate: parsed.data.days_since_certificate,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    const sentimentPolicy = resolveFieldPolicy(settings, "review.sentiment", result.confidence);
    const summaryPolicy = resolveFieldPolicy(settings, "review.summary", result.confidence);
    const topicsPolicy = resolveFieldPolicy(settings, "review.topics", result.confidence);

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai, sentiment: result.sentiment, actionable: result.actionable },
    });

    return apiOk({
      ai_disabled: false,
      sentiment: {
        sentiment: sentimentPolicy === "manual" ? null : result.sentiment,
        summary: summaryPolicy === "manual" ? "" : result.summary,
        topics: topicsPolicy === "manual" ? [] : result.topics,
        actionable: result.actionable,
        confidence: result.confidence,
        ai: result.ai,
      },
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "review ai-sentiment");
  }
}
