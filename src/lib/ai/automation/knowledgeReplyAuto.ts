/**
 * 受信メッセージ (一般質問) → 店舗ナレッジで LINE 自動返信する IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。
 * 「営業時間は？」「駐車場ありますか？」のような質問に対し、テナント管理者が
 * 店舗設定 > LINEナレッジ に登録した内容 **のみ** を根拠に自動返信する。
 * ナレッジから回答できない質問には何も送らず、スタッフ対応 (受信箱) に残す。
 *
 * 安全ガード:
 *   - opt-in (inbound_message.auto_reply_knowledge, 既定 OFF) + Standard プラン以上
 *   - LINE 受信 (lineUserId あり) のみ — push で返信する
 *   - 有効なナレッジが 1 件も無ければ何もしない
 *   - AI が「ナレッジのみで回答可能」と判断し、confidence が閾値以上の場合のみ送信
 *   - intent が cancel / change_reservation のときは返信しない (予約操作は
 *     スタッフが行うため、自動返信で「対応済み」と誤認させない)
 *   - 概算見積りの自動返信が同じメッセージに返信済みの場合は呼び出し側でスキップ
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { generateKnowledgeReply, type KnowledgeEntry } from "@/lib/ai/knowledgeReply";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { sendCustomerLineText } from "@/lib/line/client";
import { fetchRecentConversation } from "@/lib/line/messageStore";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldAutoReplyKnowledge } from "./orchestrator";

const ENDPOINT = "/api/line/webhook#auto-knowledge-reply";

/**
 * プロンプトに注入するナレッジの上限件数。
 * ponytail: RAG での事前絞り込みはせず先頭 50 件を全件注入する (登録順)。
 * 50 件 × 最大 2,200 字でも fast モデルの文脈に収まる。数百件規模が必要に
 * なったら pgvector 等の検索に移行する。
 */
const KNOWLEDGE_LIMIT = 50;

export interface MaybeAutoReplyKnowledgeParams {
  tenantId: string;
  /** 既知顧客 ID。null (未紐付けの新規客) でも返信する。 */
  customerId: string | null;
  /** 返信先 LINE ユーザー ID。無ければ push できないので何もしない。 */
  lineUserId?: string | null;
  /** AI 抽出結果の intent (extractInboundReservation)。 */
  intent: string;
  /** 受信メッセージの原文。 */
  text: string;
  /** 起票元の customer_messages.id (会話文脈の基準 + トレーサビリティ用)。 */
  messageId: string | null;
  channel?: string;
  /** 呼び出し元 (inboundAuto) が既にロード済みなら渡して二重読込を避ける。 */
  settings?: AiAutomationSettings;
  tenant?: { plan_tier: string | null; is_active: boolean | null };
}

/** 受信メッセージに店舗ナレッジで LINE 自動返信する。失敗しても投げない。 */
export async function maybeAutoReplyKnowledge(params: MaybeAutoReplyKnowledgeParams): Promise<void> {
  const { tenantId, customerId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return; // push 返信先が無い (LINE 以外) なら何もしない
    if (!params.text?.trim()) return;
    // 予約のキャンセル・変更はスタッフが操作する。ナレッジ返信で「対応済み」と
    // 誤認させないため返信しない (受信箱でスタッフが対応する)。
    if (params.intent === "cancel" || params.intent === "change_reservation") return;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoReplyKnowledge(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-reply knowledge — LINE webhook lacks auth session");
    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract")) return;

    // 回答ソース: 有効なナレッジ (登録順)。1 件も無ければ学習前なので何もしない。
    const { data: knowledgeRows } = await admin
      .from("tenant_line_knowledge")
      .select("title, content")
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(KNOWLEDGE_LIMIT);
    const knowledge = ((knowledgeRows as KnowledgeEntry[] | null) ?? []).filter(
      (k) => k.title?.trim() && k.content?.trim(),
    );
    if (knowledge.length === 0) return;

    const { data: tenantNameRow } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

    // 「それは土曜もですか？」のような指示語を解釈できるよう会話文脈も渡す。
    const history = await fetchRecentConversation(
      tenantId,
      { customerId, lineUserId },
      { currentMessageId: params.messageId },
    );

    const usage = startAiRouteUsage(ENDPOINT);
    const result = await generateKnowledgeReply(
      {
        text: params.text,
        knowledge,
        history,
        tenantName: (tenantNameRow as { name?: string | null } | null)?.name ?? null,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    const threshold = typeof settings.confidenceThreshold === "number" ? settings.confidenceThreshold : 0.5;
    const reply = result.reply?.trim();
    if (!result.ai || !result.can_answer || !reply || result.confidence < threshold) {
      usage.record({
        tenantId,
        outcome: result.ai ? "ok" : "error",
        confidence: result.confidence,
        meta: { auto: true, committed: false, can_answer: result.can_answer, ai: result.ai },
      });
      return;
    }

    const delivered = await sendCustomerLineText({
      tenantId,
      customerId: customerId ?? null,
      lineUserId,
      body: reply,
    });
    if (!delivered) {
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_reply_knowledge",
      resource: { kind: "line_user", id: lineUserId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        confidence: result.confidence,
        knowledge_count: knowledge.length,
      },
    });

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { auto: true, committed: true, knowledge_count: knowledge.length },
    });
  } catch (e) {
    logger.warn("[knowledgeReplyAuto] maybeAutoReplyKnowledge threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
