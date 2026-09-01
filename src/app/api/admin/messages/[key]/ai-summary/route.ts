/**
 * POST /api/admin/messages/[key]/ai-summary
 *
 * 受信箱スレッドの直近のやり取りを、担当外のスタッフが引き継げるよう AI が要約して返す。
 * **送信はしない** (社内向けの読む要約)。
 *
 * - プラン: ai_inquiry_classify (Standard+) を流用 (AI 返信ドラフトと同じ)
 * - AI 設定が無効 (settings.enabled=false) なら ai_disabled を返す
 * - rate limit は "ai" プリセット
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiPlanLimit,
  apiForbidden,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { generateThreadSummary } from "@/lib/ai/threadSummary";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { parseThreadKey } from "@/lib/messages/threadKey";
import { loadAiThreadContext } from "@/lib/messages/aiThreadContext";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const usage = startAiRouteUsage("/api/admin/messages/[key]/ai-summary");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");
    if (ref.kind === "email") return apiValidationError("メールスレッドはAI要約に未対応です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_inquiry_classify")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 会話要約は Standard プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, summary: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // スレッド文脈 (表示名/店舗名/直近やり取り/登録車両) を ai-reply と共通のローダで解決。
    const loaded = await loadAiThreadContext(admin, tenantId, ref, { turnLimit: 30 });
    if (!loaded.ok) return apiNotFound("thread not found");
    const { customerName, shopName, vehicle, turns } = loaded.ctx;
    if (turns.length === 0) {
      return apiOk({ ai_disabled: false, summary: null, reason: "no_messages" });
    }

    const result = await generateThreadSummary(
      { turns, customerName, shopName, vehicle },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId,
      userId: caller.userId,
      // AI が空を返すのは失敗ではなく正常な結果 (材料不足等) なので error にしない。
      outcome: "ok",
      meta: { has_summary: result.summary.length > 0, turns: turns.length, ai: result.ai },
    });

    return apiOk({
      ai_disabled: false,
      summary: result.summary || null,
      next_action: result.next_action || null,
      ai: result.ai,
    });
  } catch (e) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "messages ai-summary");
  }
}
