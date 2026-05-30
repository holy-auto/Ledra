/**
 * 受領サイン後の顧客レビューを、人の操作なしで AI 解析する IO 層。
 *
 * 公開レビュー送信フロー (`/api/signature/review/[token]` POST) から
 * **fire-and-forget** で呼ばれる。顧客向けレスポンスを遅らせないため await しない。
 * webhook 同様に auth セッションが無いので service-role で読み書きし、絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし review.auto_analyze が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_review_sentiment) と is_active を確認
 *   3. analyzeReviewSentiment を実行し signature_reviews の AI 列に保存
 *
 * 壁3 とは無関係 (sentiment/summary/topics は注釈のみ)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { analyzeReviewSentiment } from "@/lib/ai/reviewSentiment";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoAnalyzeReview } from "./orchestrator";

const AUTO_ANALYZE_ENDPOINT = "/api/signature/review#auto-analyze";

export interface MaybeAutoAnalyzeReviewParams {
  tenantId: string;
  /** signature_reviews.id — 解析結果の書き込み先。 */
  reviewId: string | null;
  /** レビュー本文 (空なら解析しない)。 */
  comment: string | null;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * レビューを自動でセンチメント解析し signature_reviews に保存。失敗しても投げない。
 */
export async function maybeAutoAnalyzeReview(params: MaybeAutoAnalyzeReviewParams): Promise<void> {
  const { tenantId, reviewId, comment } = params;
  try {
    if (!reviewId) return;
    if (!comment || !comment.trim()) return; // コメント無しは解析対象外

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoAnalyzeReview(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-analyze review — public sign flow lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_review_sentiment")) return;

    const usage = startAiRouteUsage(AUTO_ANALYZE_ENDPOINT);
    const result = await analyzeReviewSentiment({ text: comment });

    const { error: upErr } = await admin
      .from("signature_reviews")
      .update({
        ai_sentiment: result.sentiment,
        ai_summary: result.summary,
        ai_topics: result.topics,
        ai_actionable: result.actionable,
        ai_confidence: result.confidence,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .eq("tenant_id", tenantId);
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[reviewAuto] ai analysis update failed", { tenantId, err: upErr.message });
    }

    usage.record({
      tenantId,
      outcome: result.ai ? "ok" : "error",
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      meta: { auto: true, sentiment: result.sentiment, actionable: result.actionable },
    });
  } catch (e) {
    logger.warn("[reviewAuto] maybeAutoAnalyzeReview threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
