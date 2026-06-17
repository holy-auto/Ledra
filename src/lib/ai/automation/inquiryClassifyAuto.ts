/**
 * 顧客ポータルの問い合わせを、人の操作なしで AI 分類 + 返信下書き生成する IO 層。
 *
 * 問い合わせ送信フロー (`/api/customer/inquiry` POST) から **fire-and-forget** で
 * 呼ばれる。顧客向けレスポンスを遅らせないため await しない。公開フローで auth
 * セッションが無いので service-role で読み書きし、絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし inquiry.auto_classify が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_inquiry_classify) と is_active を確認
 *   3. classifyInquiry を実行し customer_inquiries の AI 列に保存
 *
 * 壁3 とは無関係: 出力は category / priority / draft_reply の注釈・下書きのみで、
 * 返信の送信は必ず人が行う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { classifyInquiry } from "@/lib/ai/inquiryClassify";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoClassifyInquiry } from "./orchestrator";

const AUTO_CLASSIFY_ENDPOINT = "/api/customer/inquiry#auto-classify";

export interface MaybeAutoClassifyInquiryParams {
  tenantId: string;
  /** customer_inquiries.id — 分類結果の書き込み先。 */
  inquiryId: string | null;
  subject: string | null;
  message: string | null;
  customerName?: string | null;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 問い合わせを自動分類し customer_inquiries に保存。失敗しても投げない。
 */
export async function maybeAutoClassifyInquiry(params: MaybeAutoClassifyInquiryParams): Promise<void> {
  const { tenantId, inquiryId, subject, message, customerName } = params;
  try {
    if (!tenantId || !inquiryId) return;
    if (!message || !message.trim()) return; // 本文無しは分類対象外

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoClassifyInquiry(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-classify inquiry — public portal flow lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inquiry_classify")) return;

    const usage = startAiRouteUsage(AUTO_CLASSIFY_ENDPOINT);
    const result = await classifyInquiry({
      subject: subject ?? "",
      message,
      customerHistory: customerName ? { name: customerName } : undefined,
    });

    const { error: upErr } = await admin
      .from("customer_inquiries")
      .update({
        ai_category: result.category,
        ai_priority: result.priority,
        ai_draft_reply: result.draft_reply,
        ai_confidence: result.confidence,
        ai_classified_at: new Date().toISOString(),
      })
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId);
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[inquiryClassifyAuto] ai classification update failed", { tenantId, err: upErr.message });
    }

    usage.record({
      tenantId,
      outcome: result.ai ? "ok" : "error",
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      meta: { auto: true, category: result.category, priority: result.priority },
    });
  } catch (e) {
    logger.warn("[inquiryClassifyAuto] maybeAutoClassifyInquiry threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
