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
import {
  generateKnowledgeReply,
  KNOWLEDGE_LIMIT,
  SHARED_KNOWLEDGE_LIMIT,
  type KnowledgeEntry,
} from "@/lib/ai/knowledgeReply";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { fetchRecentConversation, type ConversationTurn } from "@/lib/line/messageStore";
import { buildFollowupButtons } from "@/lib/line/flow/messages";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldAutoReplyKnowledge } from "./orchestrator";

const ENDPOINT = "/api/line/webhook#auto-knowledge-reply";

// ponytail: 注入は RAG での事前絞り込みをせず先頭から全件 (KNOWLEDGE_LIMIT +
// SHARED_KNOWLEDGE_LIMIT = 80 件、1 件 ≤2,200 字) を渡す。数百件規模が必要に
// なったら pgvector 等の検索に移行する。上限定義は knowledgeReply.ts (単一定義)。

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
  tenant?: { plan_tier: string | null; is_active: boolean | null; name?: string | null };
  /** 呼び出し元が抽出用に取得済みの会話文脈。渡されなければ自前で取得する。 */
  history?: ConversationTurn[];
  /**
   * 回答の末尾に「次の行動」誘導ボタン (お見積り依頼 / スタッフ相談) を添えるか。
   * 呼び出し元 (inboundAuto) が「会話フロー opt-in ON かつ進行中フロー無し」のときだけ
   * true を渡す。進行中フローがある間にボタンを出すと、start_quote が二重開始で無反応に
   * なるため。既定 false (従来どおりテキストのみ)。
   */
  attachButtons?: boolean;
}

function hasText(k: { title?: string | null; content?: string | null }): k is KnowledgeEntry {
  return !!k.title?.trim() && !!k.content?.trim();
}

/**
 * 受信メッセージに店舗ナレッジで LINE 自動返信する。失敗しても投げない。
 * 返り値は「このメッセージに返信を送ったか」— 呼び出し側 (inboundAuto) が
 * 概算見積り自動返信との二重返信を防ぐために使う。
 */
export async function maybeAutoReplyKnowledge(params: MaybeAutoReplyKnowledgeParams): Promise<boolean> {
  const { tenantId, customerId } = params;
  // 送信成功後に後続処理 (監査ログ等) が投げても「返信済み」を正しく報告する。
  let replied = false;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return false; // push 返信先が無い (LINE 以外) なら何もしない
    if (!params.text?.trim()) return false;
    // 許可 intent のみ返信する (fail-closed)。cancel / change_reservation は
    // スタッフが操作するため、ナレッジ返信で「対応済み」と誤認させない。
    // intent の enum が将来増えても、明示的に許可するまで自動返信しない。
    // status_inquiry も許可する: 専用の状況返信 (auto_status_reply) が OFF のテナントでも、
    // 状況を尋ねる一般質問がナレッジで拾えるように (can_answer 判定があるので過剰返信はしない)。
    if (!["inquiry_only", "new_reservation", "other", "status_inquiry"].includes(params.intent)) return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoReplyKnowledge(settings)) return false;

    const admin = createServiceRoleAdmin("AI auto-reply knowledge — LINE webhook lacks auth session");
    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active, name").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return false;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract")) return false;

    // 回答ソース: 店舗ナレッジ + 全テナント共有ナレッジ (どちらも enabled のみ・登録順)。
    // 独立クエリなので並列に取得する。合わせて 1 件も無ければ学習前なので何もしない。
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
    const knowledge = ((tenantKnowledgeRes.data as KnowledgeEntry[] | null) ?? []).filter(hasText);
    const sharedKnowledge = ((sharedKnowledgeRes.data as KnowledgeEntry[] | null) ?? []).filter(hasText);
    if (knowledge.length + sharedKnowledge.length === 0) return false;

    // 「それは土曜もですか？」のような指示語を解釈できるよう会話文脈も渡す。
    // 呼び出し元 (inboundAuto) が抽出用に取得済みならそれを再利用する。
    const history =
      params.history ??
      (await fetchRecentConversation(tenantId, { customerId, lineUserId }, { currentMessageId: params.messageId }));

    // ponytail: 雑談・お礼だけのメッセージでも AI 呼び出しは走る (can_answer=false で
    // 返信はしない)。トークン節約の上限に当たったら、extractInboundReservation の
    // 抽出結果に「質問を含むか」のブール値を追加してここで前置きゲートする。
    const usage = startAiRouteUsage(ENDPOINT);
    const result = await generateKnowledgeReply(
      {
        text: params.text,
        knowledge,
        sharedKnowledge,
        history,
        tenantName: (tenant as { name?: string | null }).name ?? null,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    const threshold = settings.confidenceThreshold;
    const reply = result.reply?.trim();
    if (!result.ai || !result.can_answer || !reply || result.confidence < threshold) {
      usage.record({
        tenantId,
        outcome: result.ai ? "ok" : "error",
        confidence: result.confidence,
        meta: { auto: true, committed: false, can_answer: result.can_answer, ai: result.ai },
      });
      return false;
    }

    // 回答の末尾に「次の行動」誘導ボタン (お見積り依頼 / スタッフ相談) を添えるか。
    // 判断は呼び出し元 (inboundAuto) が会話フロー状態を見て決める (attachButtons)。
    // ボタン無しなら従来どおりテキストのみ (opt-in OFF テナントは挙動不変)。
    const delivered = params.attachButtons
      ? await sendCustomerLineButtons({
          tenantId,
          customerId: customerId ?? null,
          lineUserId,
          text: reply,
          buttons: buildFollowupButtons(),
        })
      : await sendCustomerLineText({
          tenantId,
          customerId: customerId ?? null,
          lineUserId,
          body: reply,
        });
    if (!delivered) {
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return false;
    }
    replied = true;

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
        shared_knowledge_count: sharedKnowledge.length,
      },
    });

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: result.confidence,
      meta: {
        auto: true,
        committed: true,
        knowledge_count: knowledge.length,
        shared_knowledge_count: sharedKnowledge.length,
      },
    });
    return true;
  } catch (e) {
    logger.warn("[knowledgeReplyAuto] maybeAutoReplyKnowledge threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return replied;
  }
}
