/**
 * 会話フローの「応答取り込み」IO 層 (Phase 1b-2) — 可否ゲート。
 *
 *   A. スタッフが正式見積書を送付 (draft→sent) した時点で、その見積りに紐づく
 *      フローを quote_drafted → awaiting_quote_ok へ進め、顧客に可否ボタンを送る
 *      (maybeAdvanceFlowOnQuoteSent、documents PUT から呼ぶ)。
 *   B. 顧客が可否ボタン (postback) を押した時点で分岐する (handleFlowPostback、
 *      LINE webhook の postback から呼ぶ):
 *        - はい → 日程調整へ (現状はスタッフ引き継ぎ + 案内。自動日程提示は 1b-3)
 *        - 相談する / 想定外 → スタッフ引き継ぎ
 *
 * すべて opt-in (inbound_message.auto_conversation_flow) + fail-soft。
 * 金額の外向き確定 (見積書の送付そのもの) は人が行った後にだけ進む (壁3 維持)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { recordInboundLineMessage } from "@/lib/line/messageStore";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { getActiveFlow, getFlowByQuoteDoc, advanceFlow } from "@/lib/line/flow/flowStore";
import { interpretReply } from "@/lib/line/flow/interpret";
import { buildQuoteApprovalAsk, buildScheduleHandoff, buildQuoteConsultHandoff } from "@/lib/line/flow/messages";
import { loadAiAutomationSettings } from "./policy";
import { shouldRunConversationFlow, shouldAutoSendDocumentOnConfirm } from "./orchestrator";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** テナントが有効 + AI 会話フローのプラン要件を満たすか (他のフロー入口と同じガード)。 */
async function tenantEligible(admin: Admin, tenantId: string): Promise<boolean> {
  const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
  if (!tenant || tenant.is_active === false) return false;
  return canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract");
}

/** スタッフに「この後の対応」を促す通知 (fail-soft)。 */
async function notifyStaff(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
  title: string,
  body: string,
): Promise<void> {
  const { error } = await admin.from("notifications").insert({
    tenant_id: tenantId,
    user_id: null,
    notification_type: "ai_action",
    priority: "normal",
    title,
    body,
    link_path: "/admin/messages",
  });
  if (error) logger.warn("[conversationFlowPostback] notify failed", { tenantId, err: error.message });
}

/**
 * 正式見積書の送付 (draft→sent) を受けて、紐づくフローを可否待ちへ進め、
 * 顧客へ可否ボタンを送る。documents PUT の draft→sent フックから呼ぶ。失敗しても投げない。
 */
export async function maybeAdvanceFlowOnQuoteSent(params: { tenantId: string; documentId: string }): Promise<void> {
  const { tenantId, documentId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldRunConversationFlow(settings)) return;
    // 見積書が確定時に LINE 自動送付される設定のときだけ可否を尋ねる。そうでないと
    // 顧客が見積りを受け取っていないのに「お送りしました」と可否ボタンが届いてしまう。
    if (!shouldAutoSendDocumentOnConfirm(settings, "estimate")) return;

    const admin = createServiceRoleAdmin("AI conversation flow (quote sent) — no auth session");
    if (!(await tenantEligible(admin, tenantId))) return;
    const flow = await getFlowByQuoteDoc(admin, tenantId, documentId);
    if (!flow || flow.state !== "quote_drafted") return;
    const lineUserId = flow.line_user_id?.trim();
    if (!lineUserId) return;

    const ok = await advanceFlow(admin, flow, { toState: "awaiting_quote_ok", expectState: "quote_drafted" });
    if (!ok) return;

    const msg = buildQuoteApprovalAsk();
    const delivered = await sendCustomerLineButtons({
      tenantId,
      customerId: flow.customer_id,
      lineUserId,
      text: msg.text,
      buttons: msg.buttons,
    });
    if (!delivered) {
      logger.warn("[conversationFlowPostback] approval-ask delivery failed", { tenantId, lineUserId });
      return;
    }
    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_conversation_flow",
      resource: { kind: "document", id: documentId },
      detail: { flow_id: flow.id, state: "awaiting_quote_ok" },
    });
  } catch (e) {
    logger.warn("[conversationFlowPostback] maybeAdvanceFlowOnQuoteSent threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * 顧客の会話フロー postback を処理する。処理したら true (webhook 側は通常の受信箱
 * 記録に加えて分岐が走ったことを把握できる)。opt-in OFF / 該当フロー無し / 未対応
 * 状態なら false。失敗しても投げない。
 *
 * Phase 1b-2 は可否ゲート (awaiting_quote_ok) のみ対応。日程選択の自動化は 1b-3。
 */
export async function handleFlowPostback(params: {
  tenantId: string;
  lineUserId: string;
  customerId?: string | null;
  data: string;
}): Promise<boolean> {
  const { tenantId, lineUserId } = params;
  try {
    if (!lineUserId) return false;
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldRunConversationFlow(settings)) return false;

    const admin = createServiceRoleAdmin("AI conversation flow (postback) — no auth session");
    const flow = await getActiveFlow(admin, tenantId, { customerId: params.customerId, lineUserId });
    if (!flow) return false;

    const event = interpretReply(flow.state, { postbackData: params.data });
    if (!event) return false;
    if (!(await tenantEligible(admin, tenantId))) return false;

    // Phase 1b-2: 可否ゲートのみ自動処理。
    if (flow.state === "awaiting_quote_ok" && (event.type === "yes" || event.type === "no")) {
      const approved = event.type === "yes";
      // 顧客の選択をスレッドに残す (postback はスキップされ受信箱に出ないため)。
      // 失敗しても本処理は続行 (fail-soft)。
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: approved ? "「はい、お願いします」を選択" : "「相談する」を選択",
        rawEvent: { flow_postback: params.data },
      });
      // ponytail: 承認後は現状スタッフ引き継ぎ (human_takeover)。オプション提案 (Phase 2)
      // と自動日程提示 (1b-3) を実装したら awaiting_option_confirm / awaiting_schedule_pick
      // へ進める。ここを差し替えるだけで段階的に自動化を伸ばせる。
      await advanceFlow(admin, flow, {
        toState: "human_takeover",
        contextPatch: { quote_decision: approved ? "ok" : "consult" },
        expectState: "awaiting_quote_ok",
      });
      const body = approved ? buildScheduleHandoff() : buildQuoteConsultHandoff();
      await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body });
      await notifyStaff(
        admin,
        tenantId,
        approved ? "見積りOK — 日程調整をお願いします" : "見積りに相談希望 — ご対応をお願いします",
        approved
          ? "お客様が見積り内容にOKされました。代車の空きとあわせて作業日程をご案内してください。"
          : "お客様が見積りについて相談を希望されています。トークでご対応ください。",
      );
      await logAutoActionExecuted({
        tenantId,
        actionKey: "inbound_message.auto_conversation_flow",
        resource: { kind: "line_user", id: lineUserId },
        detail: { flow_id: flow.id, state: "human_takeover", quote_decision: approved ? "ok" : "consult" },
      });
      return true;
    }

    return false;
  } catch (e) {
    logger.warn("[conversationFlowPostback] handleFlowPostback threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
