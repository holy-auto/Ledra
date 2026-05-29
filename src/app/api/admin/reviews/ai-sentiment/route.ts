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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { analyzeReviewSentiment } from "@/lib/ai/reviewSentiment";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(8000),
  nps_score: z.number().int().min(0).max(10).optional(),
  days_since_certificate: z.number().int().min(0).max(3650).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!canUseFeature(caller.planTier, "ai_review_sentiment")) {
      return apiPlanLimit("AI レビュー解析は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) return apiOk({ ai_disabled: true, sentiment: null });

    const result = await analyzeReviewSentiment({
      text: parsed.data.text,
      npsScore: parsed.data.nps_score,
      daysSinceCertificate: parsed.data.days_since_certificate,
    });

    const sentimentPolicy = resolveFieldPolicy(settings, "review.sentiment", result.confidence);
    const summaryPolicy = resolveFieldPolicy(settings, "review.summary", result.confidence);
    const topicsPolicy = resolveFieldPolicy(settings, "review.topics", result.confidence);

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
    return apiInternalError(e, "review ai-sentiment");
  }
}
