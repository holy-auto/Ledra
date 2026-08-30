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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiPlanLimit,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { generateReplyDraft, type ReplyDraftTurn } from "@/lib/ai/replyDraft";
import { type KnowledgeEntry, KNOWLEDGE_LIMIT, SHARED_KNOWLEDGE_LIMIT } from "@/lib/ai/knowledgeReply";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { parseThreadKey } from "@/lib/messages/threadKey";

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

    // スレッドの表示名と直近メッセージを集める。
    let customerName: string | null = null;
    let lineUserId: string | null = null;
    let customerId: string | null = null;

    if (ref.kind === "customer") {
      const { data: c } = await admin
        .from("customers")
        .select("id, name, line_user_id")
        .eq("id", ref.customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!c) return apiNotFound("thread not found");
      customerId = c.id as string;
      customerName = (c.name as string | null) ?? null;
      lineUserId = (c.line_user_id as string | null) ?? null;
    } else {
      lineUserId = ref.lineUserId;
      const { data: matched } = await admin
        .from("customers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("line_user_id", ref.lineUserId)
        .limit(1)
        .maybeSingle();
      if (matched) {
        customerId = matched.id as string;
        customerName = (matched.name as string | null) ?? null;
      }
    }

    // 直近メッセージ (customer_id / line_user_id 両面、古い順)。
    const turns: ReplyDraftTurn[] = [];
    if (customerId) {
      const { data } = await admin
        .from("customer_messages")
        .select("direction, body, created_at")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(20);
      for (const m of (data ?? []).reverse()) {
        turns.push({ direction: m.direction as "inbound" | "outbound", body: (m.body as string) ?? "" });
      }
    } else if (lineUserId) {
      const { data } = await admin
        .from("customer_messages")
        .select("direction, body, created_at")
        .eq("tenant_id", tenantId)
        .eq("line_user_id", lineUserId)
        .order("created_at", { ascending: false })
        .limit(20);
      for (const m of (data ?? []).reverse()) {
        turns.push({ direction: m.direction as "inbound" | "outbound", body: (m.body as string) ?? "" });
      }
    }

    if (turns.length === 0) {
      return apiOk({ ai_disabled: false, draft: null, reason: "no_messages" });
    }

    // 店舗名 (トーン調整用) / 店舗ナレッジ (回答根拠) / お客様の登録車両 (文脈) を並列取得。
    // ナレッジは LINE 自動返信と同じソース (enabled のみ)。人が下書きを編集して送るため、
    // 自動返信より緩めに文脈へ載せてよい。
    const [tenantRes, tenantKnowledgeRes, sharedKnowledgeRes, vehicleRes] = await Promise.all([
      admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
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
      customerId
        ? admin
            .from("vehicles")
            .select("maker, model")
            .eq("tenant_id", tenantId)
            .eq("customer_id", customerId)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const knowledge: KnowledgeEntry[] = [
      ...((tenantKnowledgeRes.data as KnowledgeEntry[] | null) ?? []),
      ...((sharedKnowledgeRes.data as KnowledgeEntry[] | null) ?? []),
    ];
    const v = vehicleRes.data as { maker: string | null; model: string | null } | null;
    const vehicle = v ? [v.maker, v.model].filter((s): s is string => !!s && s.trim().length > 0).join(" ") : null;

    const result = await generateReplyDraft(
      {
        turns,
        customerName,
        shopName: (tenantRes.data?.name as string | null) ?? null,
        vehicle: vehicle || null,
        knowledge,
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
