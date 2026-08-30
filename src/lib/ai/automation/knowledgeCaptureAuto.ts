/**
 * LINE 返信からのナレッジ自動蓄積 (inbound_message.auto_capture_knowledge)。
 *
 * スタッフが受信箱から顧客へ LINE 返信した直後に fire-and-forget で呼ばれ、その会話が
 * 再利用可能な FAQ を含むなら、AI が個人情報を除いた汎用 Q&A に一般化して
 * `tenant_line_knowledge` に **enabled=false (レビュー待ち)** で保存する。人 (管理者) が
 * 設定画面で承認 (enabled=true) してはじめて Bot の回答ソースになる。
 *
 * これにより「良い回答が特定スタッフの頭の中にしか無い」状態を、実際の返信から
 * ナレッジへ自動で移し替えていく (属人性の低減)。失敗しても投げない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { generateKnowledgeCandidate } from "@/lib/ai/knowledgeCapture";
import { KNOWLEDGE_LIMIT } from "@/lib/ai/knowledgeReply";
import type { ReplyDraftTurn } from "@/lib/ai/replyDraft";
import { fetchRecentConversation } from "@/lib/line/messageStore";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation, type AiAutomationSettings } from "./policy";
import { shouldCaptureKnowledge } from "./orchestrator";

const ENDPOINT = "/api/admin/messages/[key]#auto-capture-knowledge";
/** レビュー待ちに積む最低 confidence。承認ゲートがあるので過度に厳しくはしない。 */
const CAPTURE_CONFIDENCE_MIN = 0.5;
/**
 * レビュー未承認 (enabled=false) の自動候補の上限。全体の KNOWLEDGE_LIMIT を候補で
 * 食い潰して手動登録を塞がないよう、未承認の溜まり過ぎを止める (レビューを促す)。
 */
const MAX_PENDING_DRAFTS = 10;
/** AI 呼び出し前の安価な足切り: この文字数未満の返信 (「はい」「承知しました」等) は学習しない。 */
const MIN_REPLY_CHARS = 12;

/** タイトル/本文の正規化 (重複判定用。空白除去・小文字化)。 */
function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export interface MaybeCaptureKnowledgeParams {
  tenantId: string;
  customerId: string | null;
  lineUserId: string | null;
  /** たった今スタッフが送信した返信本文 (customer_messages への記録が未反映でも文脈に含める)。 */
  staffReplyBody: string;
  /** 返信したスタッフの user_id (created_by に残す。トレーサビリティ用)。 */
  sentByUserId?: string | null;
  /** 呼び出し元がロード済みなら渡して二重読込を避ける。 */
  settings?: AiAutomationSettings;
  planTier?: string | null;
}

/**
 * 直近の会話から FAQ 候補を 1 件抽出し、レビュー待ち (enabled=false) で保存する。
 * 保存したら true。opt-in OFF / 対象外 / 再利用不可 / 上限到達 / 重複ならスキップ (false)。
 */
export async function maybeCaptureKnowledgeFromReply(params: MaybeCaptureKnowledgeParams): Promise<boolean> {
  const { tenantId } = params;
  try {
    if (!params.customerId && !params.lineUserId) return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldCaptureKnowledge(settings)) return false;

    // 安価な足切り: 定型の短い返信 (「はい」「承知しました」等) は AI に掛けず学習しない。
    const reply = params.staffReplyBody.trim();
    if (reply.length < MIN_REPLY_CHARS) return false;

    const admin = createServiceRoleAdmin("AI knowledge capture — fire-and-forget from admin reply");
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    // 既存ナレッジを 1 回だけ取得し、上限・未承認溜まり・重複判定に使い回す。
    const { data: existingRows, error: existErr } = await admin
      .from("tenant_line_knowledge")
      .select("title, content, enabled")
      .eq("tenant_id", tenantId)
      .limit(KNOWLEDGE_LIMIT);
    if (existErr) {
      logger.warn("[knowledgeCaptureAuto] existing fetch failed", { tenantId, err: existErr.message });
      return false;
    }
    const existing =
      (existingRows as Array<{ title: string | null; content: string | null; enabled: boolean | null }> | null) ?? [];
    // 上限到達なら積まない (登録済みと合わせて KNOWLEDGE_LIMIT を超えない)。
    if (existing.length >= KNOWLEDGE_LIMIT) return false;
    // 未承認 (enabled=false) の候補が溜まり過ぎなら止める (全枠を候補で食い潰し手動登録を塞がない)。
    if (existing.filter((e) => e.enabled === false).length >= MAX_PENDING_DRAFTS) return false;

    // 直近メッセージ (古い順・両キー OR・配信失敗 outbound 除外) を既存ヘルパーで取得。
    // ConversationTurn(text/date) → ReplyDraftTurn(body) にマッピングする。
    const convo = await fetchRecentConversation(
      tenantId,
      { customerId: params.customerId, lineUserId: params.lineUserId },
      { limit: 12 },
    );
    const turns: ReplyDraftTurn[] = convo.map((t) => ({ direction: t.direction, body: t.text }));
    // 送信直後で customer_messages に未反映でも、送った返信を文脈に必ず含める
    // (末尾がその返信でなければ outbound として補う)。
    const last = turns[turns.length - 1];
    if (!last || last.direction !== "outbound" || last.body.trim() !== reply) {
      turns.push({ direction: "outbound", body: reply });
    }

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

    const usage = startAiRouteUsage(ENDPOINT);
    const candidate = await generateKnowledgeCandidate(
      { turns, shopName: (tenant?.name as string | null) ?? null },
      { model: fastModelForPlanTier(params.planTier ?? null) },
    );
    if (!candidate.reusable || candidate.confidence < CAPTURE_CONFIDENCE_MIN) {
      // 再利用不可・低 confidence は失敗ではなく正常なスキップ (AI エラー率を汚さない)。
      usage.record({ tenantId, outcome: "ok", meta: { auto: true, captured: false, ai: candidate.ai } });
      return false;
    }

    // 重複回避: 既存エントリ (enabled 問わず) と正規化タイトル/本文が一致するものはスキップ。
    const titleN = normalize(candidate.title);
    const contentN = normalize(candidate.content);
    const dup = existing.some(
      (e) => (titleN && normalize(e.title ?? "") === titleN) || normalize(e.content ?? "") === contentN,
    );
    if (dup) {
      usage.record({ tenantId, outcome: "ok", meta: { auto: true, captured: false, duplicate: true } });
      return false;
    }

    const { error: insErr } = await admin.from("tenant_line_knowledge").insert({
      tenant_id: tenantId,
      title: candidate.title,
      content: candidate.content,
      enabled: false, // レビュー待ち。管理者が承認するまで Bot は使わない。
      created_by: params.sentByUserId ?? null,
    });
    if (insErr) {
      logger.warn("[knowledgeCaptureAuto] insert failed", { tenantId, err: insErr.message });
      usage.record({ tenantId, outcome: "error", meta: { auto: true, captured: false } });
      return false;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_capture_knowledge",
      resource: { kind: "line_user", id: params.lineUserId ?? params.customerId ?? "unknown" },
      detail: { title: candidate.title, confidence: candidate.confidence, pending_review: true },
    });
    usage.record({
      tenantId,
      outcome: "ok",
      confidence: candidate.confidence,
      meta: { auto: true, captured: true },
    });
    return true;
  } catch (e) {
    logger.warn("[knowledgeCaptureAuto] maybeCaptureKnowledgeFromReply threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
