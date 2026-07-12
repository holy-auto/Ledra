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
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { getActiveFlow, createFlow, advanceFlow } from "@/lib/line/flow/flowStore";
import { buildQuoteDetailAsk, buildFormalQuoteComingAck } from "@/lib/line/flow/messages";
import { createInboundQuoteDraft } from "./quoteDraftCore";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldRunConversationFlow } from "./orchestrator";

const FLOW_QUOTE_ENDPOINT = "/api/line/webhook#flow-quote-draft";

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

export interface MaybeAdvanceQuoteFlowParams {
  tenantId: string;
  customerId: string | null;
  lineUserId?: string | null;
  /** 今回の受信から抽出した施工内容・車両 (詳細返信の中身)。 */
  service?: string;
  vehicleText?: string;
  messageId: string | null;
  channel?: string;
  settings?: AiAutomationSettings;
  tenant?: { plan_tier: string | null; is_active: boolean | null };
}

/**
 * `awaiting_quote_detail` の進行中フローに対し、顧客が返してきた詳細 (車種+年式)
 * を取り込んで正式見積書の下書きを作成し、フローを `quote_drafted` へ進める。
 *
 * 返り値 true = この受信をフロー詳細として処理した (呼び出し側は概算/ナレッジ等の
 * 他の返信をスキップする)。false = 該当フロー無し / 詳細が読めない → 未処理。
 *
 * 既知顧客のみ下書きを作る (未紐付け客の登録誘導は後続フェーズ)。失敗しても投げない。
 */
export async function maybeAdvanceQuoteFlowOnDetail(params: MaybeAdvanceQuoteFlowParams): Promise<boolean> {
  const { tenantId, customerId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldRunConversationFlow(settings)) return false;

    const admin = createServiceRoleAdmin("AI conversation flow (advance) — LINE webhook lacks auth session");
    const flow = await getActiveFlow(admin, tenantId, { customerId, lineUserId });
    if (!flow || flow.state !== "awaiting_quote_detail") return false;

    // 見積り下書きは既知顧客のみ。未紐付け客は登録誘導 (後続フェーズ) までフローを保持。
    const draftCustomerId = flow.customer_id ?? customerId;
    if (!draftCustomerId) return false;

    // 施工内容は元の問い合わせ (context) を、車両は今回の返信を優先して合成する。
    const ctx = flow.context_json as { service?: string | null; vehicle_text?: string | null };
    const service = params.service?.trim() || ctx.service?.trim() || "";
    const vehicleText = params.vehicleText?.trim() || ctx.vehicle_text?.trim() || "";
    // 車両が今回も過去も読めないなら詳細ではない (質問等)。フローは保持して未処理を返す。
    if (!params.vehicleText?.trim() && !ctx.vehicle_text?.trim()) return false;
    if (!service || !vehicleText) return false;

    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return false;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return false;

    const usage = startAiRouteUsage(FLOW_QUOTE_ENDPOINT);
    const draft = await createInboundQuoteDraft(admin, {
      tenantId,
      customerId: draftCustomerId,
      service,
      vehicleText,
      planTier: tenant.plan_tier,
      sourceMessageId: params.messageId,
      origin: "conversation_flow",
    });
    if (!draft) {
      // 見積り材料が皆無。フローは保持し (スタッフが対応)、他の自動返信はしない。
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return true;
    }

    await advanceFlow(admin, flow, {
      toState: "quote_drafted",
      quoteDocId: draft.docId,
      contextPatch: { service, vehicle_text: vehicleText },
      expectState: "awaiting_quote_detail",
    });

    await sendCustomerLineText({
      tenantId,
      customerId: draftCustomerId,
      lineUserId,
      body: buildFormalQuoteComingAck(),
    });

    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_conversation_flow",
      resource: { kind: "document", id: draft.docId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: draftCustomerId,
        source_message_id: params.messageId,
        flow_id: flow.id,
        state: "quote_drafted",
        total: draft.total,
      },
    });

    usage.record({
      tenantId,
      outcome: draft.ai ? "ok" : "error",
      confidence: draft.confidence,
      meta: { auto: true, committed: true, total: draft.total },
    });
    return true;
  } catch (e) {
    logger.warn("[conversationFlowAuto] maybeAdvanceQuoteFlowOnDetail threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
