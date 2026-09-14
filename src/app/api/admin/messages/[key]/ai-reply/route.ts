/**
 * POST /api/admin/messages/[key]/ai-reply
 *
 * 受信箱スレッドの直近のやり取りから、返信ドラフトを 1 件 AI 生成して返す。
 * **送信はしない** (ドラフトを返すだけ。スタッフが編集して送信する)。
 *
 * - プラン: ai_inquiry_classify (Standard+) を流用
 * - AI 設定が無効 (settings.enabled=false) なら ai_disabled を返す
 * - rate limit は "ai" プリセット
 *
 * 壁3 とは無関係 (外向き送信は人の操作)。AI は文章の下書きのみ。
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
import { generateReplyDraft } from "@/lib/ai/replyDraft";
import { type KnowledgeEntry, KNOWLEDGE_LIMIT, SHARED_KNOWLEDGE_LIMIT } from "@/lib/ai/knowledgeReply";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { parseThreadKey } from "@/lib/messages/threadKey";
import { loadAiThreadContext } from "@/lib/messages/aiThreadContext";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const usage = startAiRouteUsage("/api/admin/messages/[key]/ai-reply");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");
    // メールは返信送信できないため AI 返信ドラフトも未対応 (LINE 前提の導線)。
    if (ref.kind === "email") return apiValidationError("メールスレッドはAI返信ドラフトに未対応です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_inquiry_classify")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 返信ドラフトは Standard プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, draft: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // スレッド文脈 (表示名/店舗名/直近やり取り/登録車両) を ai-summary と共通のローダで解決。
    const loaded = await loadAiThreadContext(admin, tenantId, ref, { turnLimit: 20 });
    if (!loaded.ok) return apiNotFound("thread not found");
    const { customerName, shopName, vehicle, turns } = loaded.ctx;
    if (turns.length === 0) {
      return apiOk({ ai_disabled: false, draft: null, reason: "no_messages" });
    }

    // 店舗ナレッジ (回答根拠。LINE 自動返信と同じ enabled ソース) を並列取得。人が下書きを
    // 編集して送るため、自動返信より緩めに文脈へ載せてよい。
    const [tenantKnowledgeRes, sharedKnowledgeRes] = await Promise.all([
      admin
        .from("tenant_line_knowledge")
        .select("title, content")
        .eq("tenant_id", tenantId)
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(KNOWLEDGE_LIMIT),
      admin
        .from("global_line_knowledge")
        .select("title, content")
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(SHARED_KNOWLEDGE_LIMIT),
    ]);
    const tenantKnowledge = (tenantKnowledgeRes.data as KnowledgeEntry[] | null) ?? [];
    const sharedKnowledge = (sharedKnowledgeRes.data as KnowledgeEntry[] | null) ?? [];

    const result = await generateReplyDraft(
      {
        turns,
        customerName,
        shopName,
        vehicle,
        knowledge: tenantKnowledge,
        sharedKnowledge,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId,
      userId: caller.userId,
      outcome: result.ai ? "ok" : "error",
      confidence: result.confidence,
      meta: { has_draft: result.draft_reply.length > 0, turns: turns.length },
    });

    return apiOk({
      ai_disabled: false,
      draft: result.draft_reply || null,
      confidence: result.confidence,
      ai: result.ai,
    });
  } catch (e) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "messages ai-reply");
  }
}
