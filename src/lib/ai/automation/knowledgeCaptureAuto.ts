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
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation, type AiAutomationSettings } from "./policy";
import { shouldCaptureKnowledge } from "./orchestrator";

const ENDPOINT = "/api/admin/messages/[key]#auto-capture-knowledge";
/** レビュー待ちに積む最低 confidence。承認ゲートがあるので過度に厳しくはしない。 */
const CAPTURE_CONFIDENCE_MIN = 0.5;

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

    const admin = createServiceRoleAdmin("AI knowledge capture — fire-and-forget from admin reply");
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    // 上限に達していれば新規候補を積まない (登録済みと合わせて KNOWLEDGE_LIMIT を超えない)。
    const { count, error: countErr } = await admin
      .from("tenant_line_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (countErr) {
      logger.warn("[knowledgeCaptureAuto] count failed", { tenantId, err: countErr.message });
      return false;
    }
    if ((count ?? 0) >= KNOWLEDGE_LIMIT) return false;

    // 直近メッセージ (古い順) を集める。customer_id 優先、無ければ line_user_id。
    const turns: ReplyDraftTurn[] = [];
    const col = params.customerId ? "customer_id" : "line_user_id";
    const val = params.customerId ?? params.lineUserId;
    const { data: msgs } = await admin
      .from("customer_messages")
      .select("direction, body, created_at")
      .eq("tenant_id", tenantId)
      .eq(col, val as string)
      .order("created_at", { ascending: false })
      .limit(12);
    for (const m of ((msgs as Array<{ direction: string; body: string | null }> | null) ?? []).reverse()) {
      turns.push({ direction: m.direction === "outbound" ? "outbound" : "inbound", body: m.body ?? "" });
    }
    // 送信直後で customer_messages に未反映でも、送った返信を文脈に必ず含める
    // (末尾がその返信でなければ outbound として補う)。
    const reply = params.staffReplyBody.trim();
    const last = turns[turns.length - 1];
    if (reply && (!last || last.direction !== "outbound" || last.body.trim() !== reply)) {
      turns.push({ direction: "outbound", body: reply });
    }

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

    const usage = startAiRouteUsage(ENDPOINT);
    const candidate = await generateKnowledgeCandidate(
      { turns, shopName: (tenant?.name as string | null) ?? null },
      { model: fastModelForPlanTier(params.planTier ?? null) },
    );
    if (!candidate.reusable || candidate.confidence < CAPTURE_CONFIDENCE_MIN) {
      usage.record({ tenantId, outcome: candidate.ai ? "ok" : "error", meta: { auto: true, captured: false } });
      return false;
    }

    // 重複回避: 既存エントリ (enabled 問わず) と正規化タイトル/本文が一致するものはスキップ。
    const { data: existing } = await admin
      .from("tenant_line_knowledge")
      .select("title, content")
      .eq("tenant_id", tenantId)
      .limit(KNOWLEDGE_LIMIT);
    const titleN = normalize(candidate.title);
    const contentN = normalize(candidate.content);
    const dup = ((existing as Array<{ title: string | null; content: string | null }> | null) ?? []).some(
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
