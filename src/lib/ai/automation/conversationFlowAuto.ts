/**
 * 受信メッセージ (価格問い合わせ) → 会話フローを開始する IO 層 (Phase 1a)。
 *
 * inboundAuto から fire-and-forget で呼ばれる。概算見積りを送った後に「正式な
 * お見積りのために詳細 (車検証写真 or 車種+年式) を教えてください」と続けて尋ね、
 * スレッドを line_conversation_flows に `awaiting_quote_detail` として記録する。
 * これにより会話が「概算だけで終わる」状態を脱し、次ターン以降 (Phase 1b) で
 * 詳細受領 → 正式見積書 draft → 可否 → 日程調整へと繋げられる。
 *
 * 安全ガード:
 *   - opt-in (inbound_message.auto_conversation_flow, 既定 OFF) + Standard プラン以上
 *   - LINE 受信 (lineUserId あり) のみ
 *   - 価格問い合わせ (intent = inquiry_only / new_reservation) かつ施工内容 or 車両が
 *     読み取れた場合のみ
 *   - 既に進行中フローがあれば二重開始しない
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { sendCustomerLineText } from "@/lib/line/client";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { getActiveFlow, createFlow } from "@/lib/line/flow/flowStore";
import { buildQuoteDetailAsk } from "@/lib/line/flow/messages";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldRunConversationFlow } from "./orchestrator";

export interface MaybeStartQuoteFlowParams {
  tenantId: string;
  customerId: string | null;
  lineUserId?: string | null;
  intent: string;
  service?: string;
  vehicleText?: string;
  messageId: string | null;
  channel?: string;
  /**
   * この受信メッセージに対し、概算見積り or ナレッジで既に顧客へ返信済みか。
   * 返信済みなら文面が矛盾・重複するため会話フロー開始 (詳細依頼) を見送る
   * (概算の「詳細はご来店で」と、フローの「送れば見積り送付」は背反)。
   */
  alreadyReplied?: boolean;
  settings?: AiAutomationSettings;
  tenant?: { plan_tier: string | null; is_active: boolean | null };
}

/** 価格問い合わせを受けて会話フローを開始する。失敗しても投げない。 */
export async function maybeStartQuoteFlow(params: MaybeStartQuoteFlowParams): Promise<void> {
  const { tenantId, customerId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return;
    // 同一メッセージに概算/ナレッジで返信済みなら、矛盾・二重メッセージを避けて見送る。
    if (params.alreadyReplied) return;
    if (params.intent !== "inquiry_only" && params.intent !== "new_reservation") return;
    // 施工内容 or 車両のどちらも読み取れない一般文には反応しない (誤爆防止)。
    if (!params.service?.trim() && !params.vehicleText?.trim()) return;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldRunConversationFlow(settings)) return;

    const admin = createServiceRoleAdmin("AI conversation flow — LINE webhook lacks auth session");
    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract")) return;

    // 進行中フローがあれば二重開始しない (顧客が連投しても 1 本)。
    const existing = await getActiveFlow(admin, tenantId, { customerId, lineUserId });
    if (existing) return;

    const flow = await createFlow(admin, {
      tenantId,
      customerId,
      lineUserId,
      state: "awaiting_quote_detail",
      context: {
        service: params.service?.trim() || null,
        vehicle_text: params.vehicleText?.trim() || null,
        source_message_id: params.messageId,
      },
      lastMessageId: params.messageId,
    });
    if (!flow) return; // 一意制約競合など。二重送信しない。

    const delivered = await sendCustomerLineText({
      tenantId,
      customerId: customerId ?? null,
      lineUserId,
      body: buildQuoteDetailAsk(),
    });
    if (!delivered) {
      logger.warn("[conversationFlowAuto] detail-ask delivery failed", { tenantId, lineUserId });
      return;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_conversation_flow",
      resource: { kind: "line_user", id: lineUserId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        flow_id: flow.id,
        state: "awaiting_quote_detail",
      },
    });
  } catch (e) {
    logger.warn("[conversationFlowAuto] maybeStartQuoteFlow threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
