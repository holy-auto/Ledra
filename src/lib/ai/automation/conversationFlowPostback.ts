/**
 * 会話フローの「応答取り込み」IO 層 — 可否ゲート (Phase 1b-2) + 日程調整 (Phase 1b-3)
 * + オプション提案 (Phase 2)。
 *
 *   A. スタッフが正式見積書を送付 (draft→sent) した時点で、その見積りに紐づく
 *      フローを進める (maybeAdvanceFlowOnQuoteSent、documents PUT から呼ぶ):
 *        - 初回送付 (quote_drafted) → awaiting_quote_ok へ進め、可否ボタンを送る
 *        - オプション追加後の再送 (selected_options 有り) → awaiting_final_ok へ
 *          進め、最終可否ボタンを送る
 *   B. 顧客が可否ボタン (postback) を押した時点で分岐する (handleFlowPostback):
 *        - awaiting_quote_ok「はい」→ おすすめオプションを取得しボタン提示
 *          (候補ゼロなら日程候補へ直行)
 *        - awaiting_option_confirm でオプション選択 → 見積書に追加して draft に戻す
 *          (再送はスタッフが行う。壁3 維持) / 「オプションなしで進める」→ 日程候補へ
 *        - awaiting_final_ok「はい」→ 日程候補へ / 「相談する」→ スタッフ引き継ぎ
 *        - 相談する / 想定外 → スタッフ引き継ぎ
 *   C. 顧客が日程候補を選択した時点で (handleFlowPostback → handleSlotSelected):
 *        - まず awaiting_schedule_pick → scheduled への更新を試みて選択を排他確保
 *          (postback 再配信・連打による二重処理を防ぐ楽観ロック。失敗したら false)
 *        - 直前に埋まっていないか再検証 → 予約を自動作成 (reservations + gcal +
 *          勘定科目/ワークフロー自動提案 — 管理画面の予約作成ルートと同じフック) →
 *          フローをクローズしお礼を送る
 *        - 埋まっていればスタッフ引き継ぎ
 *        - 「その他の日程を相談する」(flow:cancel) はスタッフ引き継ぎ
 *
 * すべて opt-in (inbound_message.auto_conversation_flow) + fail-soft。
 * 金額の外向き確定 (見積書の送付そのもの) は人が行った後にだけ進む (壁3 維持)。
 * オプション追加による見積り更新も、更新後の再送はスタッフの draft→sent 操作を経る
 * (自動では送らない)。予約作成は顧客自身の明示的な承認 (見積りOK→日程選択) を
 * 経ているため、AI テキスト抽出からの自動起票 (inboundAuto.ts) と異なり
 * 「【要確認】」は付けない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { recordInboundLineMessage } from "@/lib/line/messageStore";
import { cancelReservationById, rescheduleReservationById } from "@/lib/reservations/mutate";
import { todayJst } from "@/lib/gantt/board";
import { syncCreateEvent } from "@/lib/gcal/client";
import { calcItems } from "@/lib/documents/calcItems";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import {
  getActiveFlow,
  getFlowByQuoteDoc,
  createFlow,
  advanceFlow,
  type ConversationFlowRow,
} from "@/lib/line/flow/flowStore";
import { interpretReply, parseFlowPostback } from "@/lib/line/flow/interpret";
import { fetchFlowScheduleCandidates, type FlowScheduleCandidate } from "@/lib/line/flow/scheduleCandidates";
import { addDays } from "@/lib/booking/slots";
import { fetchAddonRecommendations } from "@/lib/line/flow/addonCandidates";
import type { RecommendedOption } from "@/lib/ai/optionRecommend";
import { matchVehicleByText, type VehicleTextCandidate } from "@/lib/vehicles/matchByText";
import { maybeAutoCategorizeReservationOnIntake } from "./accountingAuto";
import { maybeAutoProposeWorkflowForReservation } from "./workflowAuto";
import {
  buildQuoteApprovalAsk,
  buildQuoteDetailAskWithService,
  buildScheduleHandoff,
  buildQuoteConsultHandoff,
  buildScheduleCandidatesAsk,
  buildScheduleConflictHandoff,
  buildReservationConfirmed,
  buildOptionRecommendAsk,
  buildOptionAddedAck,
  buildFinalQuoteApprovalAsk,
  buildCancelConfirmAsk,
  buildCancelDone,
  buildCancelAborted,
  buildCancelHandoff,
  buildRescheduleSlotAsk,
  buildRescheduleDone,
  type CancelTargetReservation,
} from "@/lib/line/flow/messages";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation, notifyStaffOfAiAction } from "./policy";
import {
  shouldRunConversationFlow,
  shouldAutoSendDocumentOnConfirm,
  shouldAutoSelfCancel,
  shouldAutoSelfReschedule,
} from "./orchestrator";
import { storeIdOrNull } from "@/lib/stores/resolveStoreId";

/** 提示した日程候補を提示順のまま保持するための context キー。日程変更フローとも共有。 */
export const SCHEDULE_CANDIDATES_KEY = "schedule_candidates";
/** 日程変更フローで変更対象の候補予約 (index→予約) を保持する context キー。rescheduleFlowAuto と共有。 */
export const RESCHEDULE_CANDIDATES_KEY = "reschedule_candidates";
/** 日程変更フローで確定した変更対象予約 (表示・gcal 更新用) を保持する context キー。rescheduleFlowAuto と共有。 */
export const RESCHEDULE_TARGET_KEY = "reschedule_target";
/** 提示したオプション候補を提示順のまま保持するための context キー。 */
const OPTION_CANDIDATES_KEY = "option_candidates";
// ponytail: 追加が確定したオプション (最終見積り再送の要否判定・予約の
// menu_items_json にも使う) の context キー。MVP として選択は常に 1 件のみ
// ([selectedOption] で毎回まるごと上書き)。天井: 複数選択に対応する場合は
// states.ts の awaiting_option_confirm 遷移をループに変え、ここを追記
// (スプレッド) に変更する必要がある。
const SELECTED_OPTIONS_KEY = "selected_options";
/** キャンセルフローで提示した対象予約 (index→予約) を保持する context キー。cancelFlowAuto と共有。 */
export const CANCEL_CANDIDATES_KEY = "cancel_candidates";

/** context_json[SELECTED_OPTIONS_KEY] の要素の形。 */
interface SelectedOptionRecord {
  name: string;
  price: number;
  menuItemId: string | null;
}

type Admin = ReturnType<typeof createServiceRoleAdmin>;
type FlowRow = ConversationFlowRow;

/** line_user_id から紐付け済み顧客 ID を 1 件解決する。未紐付け/失敗時は null (投げない)。 */
export async function resolveCustomerIdByLineUser(
  admin: Admin,
  tenantId: string,
  lineUserId: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * 正式見積書の送付 (draft→sent) を受けて、紐づくフローを可否待ちへ進め、
 * 顧客へ可否ボタンを送る。documents PUT の draft→sent フックから呼ぶ。失敗しても投げない。
 *
 * オプション追加後の再送 (context の selected_options が非空) なら、初回と区別して
 * awaiting_final_ok へ進め、最終可否の文面を送る (Phase 2)。
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
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return;
    const flow = await getFlowByQuoteDoc(admin, tenantId, documentId);
    if (!flow || flow.state !== "quote_drafted") return;
    const lineUserId = flow.line_user_id?.trim();
    if (!lineUserId) return;

    const selectedOptions = flow.context_json[SELECTED_OPTIONS_KEY];
    const isRequote = Array.isArray(selectedOptions) && selectedOptions.length > 0;
    const toState = isRequote ? "awaiting_final_ok" : "awaiting_quote_ok";

    const ok = await advanceFlow(admin, flow, { toState, expectState: "quote_drafted" });
    if (!ok) return;

    const msg = isRequote ? buildFinalQuoteApprovalAsk() : buildQuoteApprovalAsk();
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
      detail: { flow_id: flow.id, state: toState },
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
    // 会話フロー系 (見積り・誘導ボタン) と予約キャンセルは別 opt-in。どちらかが有効なら
    // postback を処理する (キャンセルのボタンは会話フロー OFF のテナントでも出るため)。
    const flowOptIn = shouldRunConversationFlow(settings);
    const selfCancelOptIn = shouldAutoSelfCancel(settings);
    const selfRescheduleOptIn = shouldAutoSelfReschedule(settings);
    if (!flowOptIn && !selfCancelOptIn && !selfRescheduleOptIn) return false;

    const admin = createServiceRoleAdmin("AI conversation flow (postback) — no auth session");

    // 本番 webhook は handleFlowPostback に customerId を渡さない。紐付け済み顧客の
    // フローは inbound テキスト処理側で customer_id をキーに引かれる (getActiveFlow は
    // customerId を優先) ため、ここで line_user_id から顧客を解決し、フロー作成・照会の
    // キーを一致させる。これが無いと、ボタンで作った詳細フロー/相談マーカーが
    // customer_id=null で作られ、次の受信で見つからず前進・抑止が効かない。
    const resolvedCustomerId = params.customerId ?? (await resolveCustomerIdByLineUser(admin, tenantId, lineUserId));

    // 状態非依存の誘導ボタン (FAQ/ナレッジ返信の末尾に添付したもの)。フロー生成・
    // 引き継ぎであり状態機械の遷移ではないため、interpretReply ではなく
    // parseFlowPostback で直接判定し、進行中フローの有無で分岐する。
    // start_quote / consult は会話フロー機能なので flowOptIn 有効時のみ。
    const pb = parseFlowPostback(params.data);
    if (flowOptIn && pb?.event === "start_quote") {
      return handleFollowupStartQuote(admin, tenantId, lineUserId, resolvedCustomerId, params.data);
    }
    // consult は会話フローだけでなくキャンセル/日程変更の選択画面 (buildCancelPickAsk /
    // buildReschedulePickAsk) にも出るため、self-cancel / self-reschedule のみ有効なテナントでも
    // 「スタッフに相談したい」が死にボタンにならないよう受ける。
    if ((flowOptIn || selfCancelOptIn || selfRescheduleOptIn) && pb?.event === "consult") {
      return handleFollowupConsult(admin, tenantId, lineUserId, resolvedCustomerId, params.data);
    }

    // 予約前日リマインダー等に添えたセルフ操作ボタン。既存の self-cancel / self-reschedule
    // フローをボタンから起動する (intent 抽出を経ずに直接開始)。cancelFlowAuto/rescheduleFlowAuto は
    // 本モジュールを import しているため、循環回避で動的 import する。
    // 起動できない (false) 主因は「進行中フローがある」で、その場合に consult へ落とすと無関係な
    // フロー (見積り等) を human_takeover に奪ってしまう。maybeStart* は対象なし/未紐付けを自前で
    // スタッフ引き継ぎ済み (true 返し) なので、false のときは何もしない no-op にして進行中フローを守る。
    if (selfCancelOptIn && pb?.event === "start_cancel") {
      const { maybeStartCancelFlow } = await import("./cancelFlowAuto");
      await maybeStartCancelFlow({
        tenantId,
        customerId: resolvedCustomerId,
        lineUserId,
        intent: "cancel",
        messageId: null,
        channel: "line",
        settings,
      });
      return true;
    }
    if (selfRescheduleOptIn && pb?.event === "start_reschedule") {
      const { maybeStartRescheduleFlow } = await import("./rescheduleFlowAuto");
      await maybeStartRescheduleFlow({
        tenantId,
        customerId: resolvedCustomerId,
        lineUserId,
        intent: "change_reservation",
        messageId: null,
        channel: "line",
        settings,
      });
      return true;
    }

    const flow = await getActiveFlow(admin, tenantId, { customerId: resolvedCustomerId, lineUserId });
    if (!flow) return false;

    const event = interpretReply(flow.state, { postbackData: params.data });
    if (!event) return false;
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    // 可否ゲート (Phase 1b-2)。
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

      if (!approved) {
        await advanceFlow(admin, flow, {
          toState: "human_takeover",
          contextPatch: { quote_decision: "consult" },
          expectState: "awaiting_quote_ok",
        });
        await sendCustomerLineText({
          tenantId,
          customerId: flow.customer_id,
          lineUserId,
          body: buildQuoteConsultHandoff(),
        });
        await notifyStaffOfAiAction(
          admin,
          tenantId,
          "見積りに相談希望 — ご対応をお願いします",
          "お客様が見積りについて相談を希望されています。トークでご対応ください。",
        );
        await logAutoActionExecuted({
          tenantId,
          actionKey: "inbound_message.auto_conversation_flow",
          resource: { kind: "line_user", id: lineUserId },
          detail: { flow_id: flow.id, state: "human_takeover", quote_decision: "consult" },
        });
        return true;
      }

      // OK → おすすめオプションを取得して提示 (Phase 2)。1 件も無ければ日程候補へ直行。
      const baseItemNames = await fetchDocumentItemNames(admin, flow.quote_doc_id);
      const ctxForAddons = flow.context_json as { service?: string | null; vehicle_text?: string | null };
      const addons = await fetchAddonRecommendations(admin, tenantId, {
        vehicle: { model: ctxForAddons.vehicle_text ?? null },
        serviceCategory: ctxForAddons.service?.trim() || "",
        baseItemNames,
      });
      if (addons.options.length === 0) {
        return presentScheduleOrHandoff(admin, tenantId, flow, lineUserId, { quote_decision: "ok" });
      }

      await advanceFlow(admin, flow, {
        toState: "awaiting_option_confirm",
        contextPatch: { quote_decision: "ok", [OPTION_CANDIDATES_KEY]: addons.options },
        expectState: "awaiting_quote_ok",
      });
      const optAsk = buildOptionRecommendAsk(addons.options);
      await sendCustomerLineButtons({
        tenantId,
        customerId: flow.customer_id,
        lineUserId,
        text: optAsk.text,
        buttons: optAsk.buttons,
      });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "見積りOK — オプションを提案しました",
        "お客様が見積り内容にOKされました。おすすめオプションを自動でご案内しています。",
      );
      await logAutoActionExecuted({
        tenantId,
        actionKey: "inbound_message.auto_conversation_flow",
        resource: { kind: "line_user", id: lineUserId },
        detail: { flow_id: flow.id, state: "awaiting_option_confirm", option_count: addons.options.length },
      });
      return true;
    }

    // オプション選択 (Phase 2)。
    if (flow.state === "awaiting_option_confirm" && event.type === "option_selected") {
      return handleOptionSelected(admin, tenantId, flow, lineUserId, event.index);
    }

    // オプションなしで進める (Phase 2)。内容は変わらないため再確認を挟まず日程候補へ。
    if (flow.state === "awaiting_option_confirm" && event.type === "options_none") {
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: "「オプションなしで進める」を選択",
        rawEvent: { flow_postback: params.data },
      });
      return presentScheduleOrHandoff(admin, tenantId, flow, lineUserId, { option_decision: "none" });
    }

    // 最終可否ゲート (Phase 2、オプション追加後の再送分)。
    if (flow.state === "awaiting_final_ok" && (event.type === "yes" || event.type === "no")) {
      const approved = event.type === "yes";
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: approved ? "「はい、お願いします」を選択 (最終確認)" : "「相談する」を選択 (最終確認)",
        rawEvent: { flow_postback: params.data },
      });
      if (!approved) {
        await advanceFlow(admin, flow, {
          toState: "human_takeover",
          contextPatch: { final_decision: "consult" },
          expectState: "awaiting_final_ok",
        });
        await sendCustomerLineText({
          tenantId,
          customerId: flow.customer_id,
          lineUserId,
          body: buildQuoteConsultHandoff(),
        });
        await notifyStaffOfAiAction(
          admin,
          tenantId,
          "最終見積りに相談希望 — ご対応をお願いします",
          "お客様が更新後のお見積りについて相談を希望されています。トークでご対応ください。",
        );
        await logAutoActionExecuted({
          tenantId,
          actionKey: "inbound_message.auto_conversation_flow",
          resource: { kind: "line_user", id: lineUserId },
          detail: { flow_id: flow.id, state: "human_takeover", final_decision: "consult" },
        });
        return true;
      }
      return presentScheduleOrHandoff(admin, tenantId, flow, lineUserId, { final_decision: "ok" });
    }

    // 日程候補の選択 (Phase 1b-3)。
    if (flow.state === "awaiting_schedule_pick" && event.type === "slot_selected") {
      return handleSlotSelected(admin, tenantId, flow, lineUserId, event.index);
    }

    // 「その他の日程を相談する」(flow:cancel → handoff)。提示した候補では合わない
    // ということなのでスタッフに引き継ぐ。
    if (flow.state === "awaiting_schedule_pick" && event.type === "handoff") {
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: "「その他の日程を相談する」を選択",
        rawEvent: { flow_postback: params.data },
      });
      await advanceFlow(admin, flow, {
        toState: "human_takeover",
        contextPatch: { schedule_decision: "consult" },
        expectState: "awaiting_schedule_pick",
      });
      await sendCustomerLineText({
        tenantId,
        customerId: flow.customer_id,
        lineUserId,
        body: buildScheduleHandoff(),
      });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "日程のご相談希望 — ご対応をお願いします",
        "お客様が提示した日程候補以外をご希望です。代車の空きとあわせて日程をご相談ください。",
      );
      await logAutoActionExecuted({
        tenantId,
        actionKey: "inbound_message.auto_conversation_flow",
        resource: { kind: "line_user", id: lineUserId },
        detail: { flow_id: flow.id, state: "human_takeover", schedule_decision: "consult" },
      });
      return true;
    }

    // 予約キャンセル: 対象が複数のとき、どれを消すか選択された。
    if (flow.state === "awaiting_cancel_pick" && event.type === "cancel_pick_selected") {
      const candidates = (flow.context_json[CANCEL_CANDIDATES_KEY] as CancelTargetReservation[] | undefined) ?? [];
      const chosen = candidates[event.index];
      if (!chosen) return false;
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: `キャンセル対象「${chosen.scheduled_date}」を選択`,
        rawEvent: { flow_postback: params.data },
      });
      // 選んだ予約を reservation_id に確定して確認待ちへ (楽観ロック)。
      const ok = await advanceFlow(admin, flow, {
        toState: "awaiting_cancel_confirm",
        reservationId: chosen.id,
        expectState: "awaiting_cancel_pick",
      });
      if (!ok) return false;
      const msg = buildCancelConfirmAsk(chosen);
      const delivered = await sendCustomerLineButtons({
        tenantId,
        customerId: flow.customer_id,
        lineUserId,
        text: msg.text,
        buttons: msg.buttons,
      });
      if (!delivered) {
        // 確認ボタンが届かなければ awaiting_cancel_confirm 行を残さない (ボタンが無いと
        // 顧客は確定も取消もできず、72h 失効まで他フローも塞がるため)。expired に落とす。
        await advanceFlow(admin, flow, { toState: "expired", expectState: "awaiting_cancel_confirm" });
        logger.warn("[conversationFlowPostback] cancel-confirm delivery failed", { tenantId, lineUserId });
        return false;
      }
      return true;
    }

    // 予約キャンセル: 実行 or 取りやめの最終確認。
    if (
      flow.state === "awaiting_cancel_confirm" &&
      (event.type === "cancel_confirmed" || event.type === "cancel_aborted")
    ) {
      return handleCancelDecision(admin, tenantId, flow, lineUserId, event.type === "cancel_confirmed", params.data);
    }

    // 日程変更: 対象が複数のとき、どれを変更するか選択された → 新日程候補の提示へ。
    if (flow.state === "awaiting_reschedule_pick" && event.type === "reschedule_pick_selected") {
      return handleReschedulePick(admin, tenantId, flow, lineUserId, event.index, params.data);
    }

    // 日程変更: 新しい日程が選択された → 予約の日時を更新して完了。
    if (flow.state === "awaiting_reschedule_slot" && event.type === "reschedule_slot_selected") {
      return handleRescheduleSlot(admin, tenantId, flow, lineUserId, event.index, params.data);
    }

    // 日程変更: 「その他の日程を相談する」(flow:cancel → handoff)。提示候補が合わないので引き継ぐ。
    if (flow.state === "awaiting_reschedule_slot" && event.type === "handoff") {
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: "「その他の日程を相談する」を選択",
        rawEvent: { flow_postback: params.data },
      });
      await advanceFlow(admin, flow, {
        toState: "human_takeover",
        contextPatch: { reschedule_decision: "consult" },
        expectState: "awaiting_reschedule_slot",
      });
      await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildScheduleHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "日程変更のご相談希望 — ご対応をお願いします",
        "お客様が提示した日程候補以外への変更をご希望です。代車の空きとあわせて日程をご相談ください。",
      );
      await logAutoActionExecuted({
        tenantId,
        actionKey: "inbound_message.auto_self_reschedule",
        resource: { kind: "line_user", id: lineUserId },
        detail: { flow_id: flow.id, state: "human_takeover", reschedule_decision: "consult" },
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

/**
 * 予約キャンセルの最終確認 (awaiting_cancel_confirm) を処理する。confirmed=true なら
 * 予約を cancelled にして完了、false なら取りやめ。呼び出し元 (handleFlowPostback) の
 * catch で保護されるため投げてよい。
 *
 * 実行前に closed へ楽観クレームして postback 再配信・連打での二重キャンセルを防ぎ、
 * 確定直前に「前日まで」を再検証する (提示後に当日入りしていたらスタッフ引き継ぎ)。
 */
async function handleCancelDecision(
  admin: Admin,
  tenantId: string,
  flow: FlowRow,
  lineUserId: string,
  confirmed: boolean,
  data: string,
): Promise<boolean> {
  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: confirmed ? "「はい、キャンセルします」を選択" : "「やめる」を選択",
    rawEvent: { flow_postback: data },
  });

  // 取りやめ → そのまま closed + 案内 (予約は維持)。
  if (!confirmed) {
    await advanceFlow(admin, flow, { toState: "closed", expectState: "awaiting_cancel_confirm" });
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildCancelAborted() });
    return true;
  }

  // 実行前に closed を楽観クレーム (二重実行防止)。通ったリクエストだけがキャンセルを行う。
  const claimed = await advanceFlow(admin, flow, { toState: "closed", expectState: "awaiting_cancel_confirm" });
  if (!claimed) return false;

  const candidates = (flow.context_json[CANCEL_CANDIDATES_KEY] as CancelTargetReservation[] | undefined) ?? [];
  const target = candidates.find((c) => c.id === flow.reservation_id) ?? null;

  // 対象未確定 (想定外) → スタッフ引き継ぎ。
  if (!flow.reservation_id || !flow.customer_id) {
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildCancelHandoff() });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "予約キャンセルのご希望 — ご対応をお願いします",
      "セルフキャンセルの対象予約を特定できませんでした。ご確認ください。",
    );
    return true;
  }

  // 確定直前の「前日まで」再検証: 提示後に日付が当日入りしていたらスタッフ対応へ切替。
  if (target && target.scheduled_date <= todayJst()) {
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildCancelHandoff() });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "予約キャンセルのご希望（当日・直前）— ご対応をお願いします",
      "当日・直前になったため自動キャンセルせずスタッフ対応に切り替えました。ご確認ください。",
    );
    return true;
  }

  const result = await cancelReservationById(admin, {
    tenantId,
    reservationId: flow.reservation_id,
    customerId: flow.customer_id,
    reason: "顧客がLINEでキャンセル",
    // 締め切りは実 DB 値でも再検証する (提示後にスタッフが当日へ日程変更した場合、
    // context スナップショット依存の上の pre-check では拾えないため二重ガード)。
    cutoffDate: todayJst(),
  });
  if (!result.ok) {
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildCancelHandoff() });
    const tooLate = result.reason === "too_late";
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      tooLate
        ? "予約キャンセルのご希望（当日・直前）— ご対応をお願いします"
        : "予約キャンセルが完了できませんでした — ご対応をお願いします",
      tooLate
        ? "当日・直前になったため自動キャンセルせずスタッフ対応に切り替えました。ご確認ください。"
        : "LINE からのセルフキャンセルが完了できませんでした。手動でご確認ください。",
    );
    return true;
  }

  await sendCustomerLineText({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    body: target ? buildCancelDone(target) : "ご予約をキャンセルしました。",
  });
  await notifyStaffOfAiAction(
    admin,
    tenantId,
    "ご予約がキャンセルされました（LINEセルフ）",
    `お客様が LINE でご予約をキャンセルされました${target ? `（${target.scheduled_date}）` : ""}。カレンダー・代車の空き等をご確認ください。`,
  );
  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_self_cancel",
    resource: { kind: "reservation", id: flow.reservation_id },
    detail: { flow_id: flow.id, state: "closed", cancelled: true, already_final: result.alreadyFinal },
  });
  return true;
}

/**
 * 日程変更: 変更対象が複数のとき選択された予約を確定し、新しい日程候補を提示する
 * (awaiting_reschedule_pick → awaiting_reschedule_slot)。空き候補が無ければスタッフ引き継ぎ。
 * 呼び出し元 (handleFlowPostback) の catch で保護されるため投げてよい。
 */
async function handleReschedulePick(
  admin: Admin,
  tenantId: string,
  flow: FlowRow,
  lineUserId: string,
  index: number,
  data: string,
): Promise<boolean> {
  const candidates = (flow.context_json[RESCHEDULE_CANDIDATES_KEY] as CancelTargetReservation[] | undefined) ?? [];
  const chosen = candidates[index];
  if (!chosen) return false;

  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: `日程変更の対象「${chosen.scheduled_date}」を選択`,
    rawEvent: { flow_postback: data },
  });

  // 新しい日程候補を取得。1 件も無ければスタッフ引き継ぎ (advanceFlow が楽観ロック=二重処理防止)。
  // 「前日まで」= 変更先も当日は不可なので翌日起点で候補を出す。動かす対象の予約は空き計算から除外。
  const slots = await fetchFlowScheduleCandidates(admin, tenantId, {
    limit: 3,
    fromDate: addDays(todayJst(), 1),
    excludeReservationId: chosen.id,
    // 変更先候補を選んだ予約の実所要時間・代車要否で絞る (rescheduleFlowAuto 単一対象時と同条件)。
    estimatedMinutes: chosen.duration_minutes,
    needsLoaner: chosen.needs_loaner,
    excludeRestricted: true,
  });
  if (slots.length === 0) {
    const ok = await advanceFlow(admin, flow, {
      toState: "human_takeover",
      contextPatch: { reschedule_decision: "no_candidates" },
      expectState: "awaiting_reschedule_pick",
    });
    if (!ok) return false;
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildScheduleHandoff() });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "日程変更の候補が見つかりません — ご対応をお願いします",
      "お客様が予約の日程変更をご希望ですが、空き日程候補が見つかりませんでした。代車の空きとあわせてご相談ください。",
    );
    return true;
  }

  // 選んだ予約を reservation_id に確定し、候補を context に保持して日程選択待ちへ (楽観ロック)。
  const claimed = await advanceFlow(admin, flow, {
    toState: "awaiting_reschedule_slot",
    reservationId: chosen.id,
    contextPatch: { [RESCHEDULE_TARGET_KEY]: chosen, [SCHEDULE_CANDIDATES_KEY]: slots },
    expectState: "awaiting_reschedule_pick",
  });
  if (!claimed) return false;

  const msg = buildRescheduleSlotAsk(chosen, slots);
  const delivered = await sendCustomerLineButtons({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    text: msg.text,
    buttons: msg.buttons,
  });
  if (!delivered) {
    // 候補ボタンが届かなければ行を残さない (ボタン無しで前進できず 72h 塞ぐため)。expired に落とす。
    await advanceFlow(admin, flow, { toState: "expired", expectState: "awaiting_reschedule_slot" });
    logger.warn("[conversationFlowPostback] reschedule-slot delivery failed", { tenantId, lineUserId });
    return false;
  }
  return true;
}

/**
 * 日程変更: 新しい日程が選択されたら、直前の空き状況を再検証してから予約の日時を更新する
 * (awaiting_reschedule_slot → closed)。実行前に closed を楽観クレームして二重更新を防ぎ、
 * 確定直前に「前日まで」と空き状況を再検証する。埋まっていれば/締め切り超過ならスタッフ引き継ぎ。
 * 呼び出し元 (handleFlowPostback) の catch で保護されるため投げてよい。
 */
async function handleRescheduleSlot(
  admin: Admin,
  tenantId: string,
  flow: FlowRow,
  lineUserId: string,
  index: number,
  data: string,
): Promise<boolean> {
  const slots = (flow.context_json[SCHEDULE_CANDIDATES_KEY] as FlowScheduleCandidate[] | undefined) ?? [];
  const chosen = slots[index];
  if (!chosen) return false;
  const target = (flow.context_json[RESCHEDULE_TARGET_KEY] as CancelTargetReservation | undefined) ?? null;

  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: `新しい日程「${chosen.date} ${chosen.start_time.slice(0, 5)}〜」を選択`,
    rawEvent: { flow_postback: data },
  });

  // 実行前に closed を楽観クレーム (postback 再配信・連打での二重更新を防ぐ)。通ったものだけ実行。
  const claimed = await advanceFlow(admin, flow, { toState: "closed", expectState: "awaiting_reschedule_slot" });
  if (!claimed) return false;

  // 対象未確定 (想定外) → スタッフ引き継ぎ。
  if (!flow.reservation_id || !flow.customer_id) {
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildCancelHandoff() });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "日程変更のご希望 — ご対応をお願いします",
      "日程変更の対象予約を特定できませんでした。ご確認ください。",
    );
    return true;
  }

  // 直前に他のお客様と重なっていないか、選んだ日 1 日分だけ再取得して確認する。
  // 動かす対象の予約自身は空き計算から除外する (同日内変更で自分の旧枠に自分がぶつからないように)。
  const fresh = await fetchFlowScheduleCandidates(admin, tenantId, {
    restrictToDate: chosen.date,
    limit: 50,
    // reservation_id は上の !flow.reservation_id ガードで truthy が保証済み。
    excludeReservationId: flow.reservation_id,
    // 提示時と同条件で再取得し、空き/所要/代車/カテゴリの制約を効かせる。
    estimatedMinutes: target?.duration_minutes,
    needsLoaner: target?.needs_loaner,
    excludeRestricted: true,
  });
  // 同一日 (restrictToDate) 内では 1 枠始点=1 候補なので start_time の一致だけで同定できる。
  // end_time は所要時間から導出される値なので照合に使わない (target 欠落時の false 不一致を避ける)。
  const stillAvailable = fresh.some((c) => c.start_time === chosen.start_time);
  if (!stillAvailable) {
    // 変更希望は未達のまま (顧客はまだ日程を動かしたい)。closed のままにせず human_takeover に
    // 移し、スタッフがトークを引き継いで別日程を調整できるようにする (handleSlotSelected と同様)。
    await advanceFlow(admin, flow, {
      toState: "human_takeover",
      contextPatch: { reschedule_conflict: true },
      expectState: "closed",
    });
    await sendCustomerLineText({
      tenantId,
      customerId: flow.customer_id,
      lineUserId,
      body: buildScheduleConflictHandoff(),
    });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "変更先の日程が埋まりました — ご対応をお願いします",
      "お客様が選んだ変更先の日程がちょうど埋まってしまいました。改めて日程のご相談をお願いします。",
    );
    return true;
  }

  const result = await rescheduleReservationById(admin, {
    tenantId,
    reservationId: flow.reservation_id,
    customerId: flow.customer_id,
    newDate: chosen.date,
    newStartTime: chosen.start_time,
    newEndTime: chosen.end_time,
    // 締め切り「前日まで」を実 DB 値でも再検証 (提示後にスタッフが当日へ日程変更した場合の二重ガード)。
    cutoffDate: todayJst(),
  });
  if (!result.ok) {
    const tooLate = result.reason === "too_late";
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildCancelHandoff() });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      tooLate
        ? "日程変更のご希望（当日・直前）— ご対応をお願いします"
        : "日程変更が完了できませんでした — ご対応をお願いします",
      tooLate
        ? "当日・直前になったため自動で日程変更せずスタッフ対応に切り替えました。ご確認ください。"
        : "LINE からのセルフ日程変更が完了できませんでした。手動でご確認ください。",
    );
    return true;
  }

  await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildRescheduleDone(chosen) });
  await notifyStaffOfAiAction(
    admin,
    tenantId,
    "ご予約の日程が変更されました（LINEセルフ）",
    `お客様が LINE で予約の日程を変更されました（${target ? `${target.scheduled_date} → ` : ""}${chosen.date} ${chosen.start_time.slice(0, 5)}〜）。カレンダー・代車の空き等をご確認ください。`,
  );
  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_self_reschedule",
    resource: { kind: "reservation", id: flow.reservation_id },
    detail: { flow_id: flow.id, state: "closed", new_date: chosen.date, new_start_time: chosen.start_time },
  });
  return true;
}

/**
 * FAQ/ナレッジ返信に添えた「お見積りをお願いしたい」ボタン (flow:start_quote) の処理。
 * 進行中フローが無ければ awaiting_quote_detail フローを作成し、詳細 (車検証 or 車種+年式)
 * を依頼する (maybeStartQuoteFlow と同じ入口メッセージ buildQuoteDetailAsk を再利用)。
 * 進行中フローがあれば二重開始せず false を返す (呼び出し元→受信箱記録+スタッフ通知に
 * フォールバック)。呼び出し元 (handleFlowPostback) の catch で保護されるため投げてよい。
 */
async function handleFollowupStartQuote(
  admin: Admin,
  tenantId: string,
  lineUserId: string,
  customerId: string | null,
  data: string,
): Promise<boolean> {
  if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

  const existing = await getActiveFlow(admin, tenantId, { customerId, lineUserId });

  // 未紐付けの LINE ユーザーは見積りフローを完了できない (正式見積りの下書き作成に顧客
  // レコードが必要で、maybeAdvanceQuoteFlowOnDetail は顧客不在なら false を返す)。
  // 詰まるフローを作らず、スタッフへ引き継ぐ (顧客登録は担当が行う)。
  if (!customerId) {
    return followupStaffHandoff(admin, tenantId, lineUserId, null, existing, data, {
      recordBody: "「お見積りをお願いしたい」を選択",
      staffTitle: "お見積りのご希望（未登録のお客様）— ご対応をお願いします",
      staffBody: "未登録のお客様がLINEで見積りをご希望です。ご登録のうえお見積りをご案内ください。",
    });
  }

  // 進行中フローがあれば二重開始しない。詳細待ちなら無反応を避けて依頼を再送する
  // (履歴に残った古いボタンの再タップ対策)。それ以外の進行中状態はスタッフ対応に委ねる。
  if (existing) {
    if (existing.state === "awaiting_quote_detail") {
      await recordInboundLineMessage({
        tenantId,
        lineUserId,
        body: "「お見積りをお願いしたい」を選択",
        rawEvent: { flow_postback: data },
      });
      await sendCustomerLineText({ tenantId, customerId, lineUserId, body: buildQuoteDetailAskWithService() });
      return true;
    }
    return false;
  }

  const flow = await createFlow(admin, {
    tenantId,
    customerId,
    lineUserId,
    state: "awaiting_quote_detail",
    context: { source: "followup_button" },
  });
  if (!flow) return false; // 一意制約競合など。二重送信しない。

  // 顧客のボタン操作をスレッドに残す (postback は受信箱に出ないため)。
  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: "「お見積りをお願いしたい」を選択",
    rawEvent: { flow_postback: data },
  });

  // FAQ後のボタン開始は施工内容が未知。車両だけ聞くと service 欠落で見積りに進めないため、
  // 施工内容+車両をテキストでまとめて依頼する (maybeAdvanceQuoteFlowOnDetail が両方を要求)。
  const delivered = await sendCustomerLineText({
    tenantId,
    customerId,
    lineUserId,
    body: buildQuoteDetailAskWithService(),
  });
  if (!delivered) {
    // 依頼文面が届かなかったのに awaiting_quote_detail 行を残すと、以降の受信でこの
    // フローが見えてしまい (詳細を送っていないのに) ボタン再提示も見積り前進も塞がれる。
    // 作った行を expired に落として、次回のボタン/フロー開始を妨げない。
    await advanceFlow(admin, flow, { toState: "expired", expectState: "awaiting_quote_detail" });
    logger.warn("[conversationFlowPostback] followup start_quote delivery failed", { tenantId, lineUserId });
    return false;
  }

  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_conversation_flow",
    resource: { kind: "line_user", id: lineUserId },
    detail: { flow_id: flow.id, state: "awaiting_quote_detail", trigger: "followup_button" },
  });
  return true;
}

/**
 * FAQ/ナレッジ返信に添えた「スタッフに相談したい」ボタン (flow:consult) の処理。
 * スタッフへ通知し、顧客へ相談受付の案内を返す。呼び出し元 (handleFlowPostback) の
 * catch で保護されるため投げてよい。
 */
async function handleFollowupConsult(
  admin: Admin,
  tenantId: string,
  lineUserId: string,
  customerId: string | null,
  data: string,
): Promise<boolean> {
  if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

  // 冪等性: 既に human_takeover (相談受付済み) なら二重通知・二重返信しない
  // (LINE の postback 再配信や、履歴に残ったボタンの再タップに対して安全にする)。
  const existing = await getActiveFlow(admin, tenantId, { customerId, lineUserId });
  if (existing?.state === "human_takeover") return true;

  return followupStaffHandoff(admin, tenantId, lineUserId, customerId, existing, data, {
    recordBody: "「スタッフに相談したい」を選択",
    staffTitle: "お客様が相談をご希望です — ご対応をお願いします",
    staffBody: "お客様がLINEで「スタッフに相談したい」を選択されました。トークでご対応ください。",
  });
}

/**
 * 誘導ボタン (相談 / 未登録の見積り希望) からスタッフへ引き継ぐ共通処理。
 * 通知とお客様への案内に加え、以降の顧客向け自動処理を止める `human_takeover` 状態を
 * 永続化する: 進行中フローがあればそれを human_takeover へ落とし (検証+1回再試行)、無ければ
 * human_takeover マーカーを新規作成する。これにより単発の相談でも「担当が対応」と伝えた後に
 * ボットが再応答しない。
 *
 * マーカーは expires_at (72h) を持ち、超過後は getActiveFlow が無視して自動応答が自然復帰する。
 * 失効行が一意インデックスを塞ぐ問題 (state が human_takeover のまま残る) は createFlow 側の
 * 失効スイープが同一キー作成時に掃除するため、rot しない。
 */
async function followupStaffHandoff(
  admin: Admin,
  tenantId: string,
  lineUserId: string,
  customerId: string | null,
  existing: FlowRow | null,
  data: string,
  copy: { recordBody: string; staffTitle: string; staffBody: string },
): Promise<boolean> {
  await recordInboundLineMessage({ tenantId, lineUserId, body: copy.recordBody, rawEvent: { flow_postback: data } });

  if (existing && existing.state !== "human_takeover") {
    // 進行中フローを human_takeover へ落として自動進行を止める。advanceFlow は楽観ロック
    // 不一致/DB失敗で false を返すため、取りこぼしたら最新状態を読み直して1回再試行。
    // refreshExpiry で失効窓を今から 72h に延長する (古いフローの残り時間を引き継がない)。
    const ok = await advanceFlow(admin, existing, {
      toState: "human_takeover",
      contextPatch: { consult_requested: true },
      expectState: existing.state,
      refreshExpiry: true,
    });
    if (!ok) {
      const fresh = await getActiveFlow(admin, tenantId, { customerId, lineUserId });
      if (fresh && fresh.state !== "human_takeover") {
        await advanceFlow(admin, fresh, {
          toState: "human_takeover",
          contextPatch: { consult_requested: true },
          expectState: fresh.state,
          refreshExpiry: true,
        });
      }
    }
  } else if (!existing) {
    // 進行中フローが無ければ durable な human_takeover マーカーを作成する (単発相談の抑止)。
    // createFlow が同一キーの失効行を掃除するため、期限切れマーカーによる rot は起きない。
    const created = await createFlow(admin, {
      tenantId,
      customerId,
      lineUserId,
      state: "human_takeover",
      context: { consult_requested: true, source: "followup_button" },
    });
    if (!created) {
      // 競合: getActiveFlow の後・insert の前に別フローができた (start_quote と consult の
      // 同時押し等) と一意制約で弾かれる。今あるフローを読み直して human_takeover に落とす
      // — でないと「担当が対応」と伝えたのに競合フローが自動のまま残る。
      const fresh = await getActiveFlow(admin, tenantId, { customerId, lineUserId });
      if (fresh && fresh.state !== "human_takeover") {
        await advanceFlow(admin, fresh, {
          toState: "human_takeover",
          contextPatch: { consult_requested: true },
          expectState: fresh.state,
          refreshExpiry: true,
        });
      }
    }
  }

  await sendCustomerLineText({ tenantId, customerId, lineUserId, body: buildQuoteConsultHandoff() });
  await notifyStaffOfAiAction(admin, tenantId, copy.staffTitle, copy.staffBody);
  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_conversation_flow",
    resource: { kind: "line_user", id: lineUserId },
    detail: { state: "human_takeover", trigger: "followup_button" },
  });
  return true;
}

/**
 * 提示済みの日程候補から `index` 番目が選ばれたことを受けて、直前の空き状況を
 * 再検証してから予約を自動作成する (Phase 1b-3)。埋まっていればスタッフに引き継ぐ。
 * 呼び出し元 (handleFlowPostback) の catch で保護されるため、ここでは投げてよい。
 */
async function handleSlotSelected(
  admin: Admin,
  tenantId: string,
  flow: FlowRow,
  lineUserId: string,
  index: number,
): Promise<boolean> {
  const candidates = (flow.context_json[SCHEDULE_CANDIDATES_KEY] as FlowScheduleCandidate[] | undefined) ?? [];
  const chosen = candidates[index];
  if (!chosen) return false;

  // 選択を排他的に確保する (楽観ロック)。LINE の postback 再配信や連打で同じ選択が
  // 二重に届いても、awaiting_schedule_pick → scheduled の更新が通るのは最初の 1 件
  // だけなので (advanceFlow は expectState にマッチする行が無ければ false を返す)、
  // 以降の空き再検証・予約作成・お礼送信を二重実行しない。
  const claimed = await advanceFlow(admin, flow, {
    toState: "scheduled",
    expectState: "awaiting_schedule_pick",
  });
  if (!claimed) return false;

  // 顧客の選択をスレッドに残す (postback はスキップされ受信箱に出ないため)。
  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: `日程候補「${chosen.date} ${chosen.start_time.slice(0, 5)}〜」を選択`,
    rawEvent: { flow_postback: `flow:slot:${index}` },
  });

  // 直前に他のお客様と重なっていないか、選んだ日 1 日分だけ再取得して確認する。
  const fresh = await fetchFlowScheduleCandidates(admin, tenantId, { restrictToDate: chosen.date, limit: 50 });
  const stillAvailable = fresh.some((c) => c.start_time === chosen.start_time && c.end_time === chosen.end_time);
  if (!stillAvailable) {
    await advanceFlow(admin, flow, {
      toState: "human_takeover",
      contextPatch: { schedule_conflict: true },
      expectState: "scheduled",
    });
    await sendCustomerLineText({
      tenantId,
      customerId: flow.customer_id,
      lineUserId,
      body: buildScheduleConflictHandoff(),
    });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "選択日程が埋まりました — ご対応をお願いします",
      "お客様が選んだ日程がちょうど埋まってしまいました。改めて日程のご相談をお願いします。",
    );
    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_conversation_flow",
      resource: { kind: "line_user", id: lineUserId },
      detail: { flow_id: flow.id, state: "human_takeover", schedule_conflict: true },
    });
    return true;
  }

  const ctx = flow.context_json as { service?: string | null; vehicle_text?: string | null };
  const title = (ctx.service?.trim() || "LINEご予約").slice(0, 200);

  let estimatedAmount = 0;
  if (flow.quote_doc_id) {
    const { data: doc } = await admin.from("documents").select("total").eq("id", flow.quote_doc_id).maybeSingle();
    estimatedAmount = (doc as { total?: number } | null)?.total ?? 0;
  }

  // 登録車両との照合 (Phase 3)。一致すれば vehicle_id を付け、既存の証明書自動化
  // (vehicle_id 必須) が案件完了時に働くようにする。曖昧な一致は誤登録を避けて
  // スキップし (matchVehicleByText)、後日の入庫日プロンプト (vehicleCaptureAuto.ts)
  // で車検証撮影から登録する経路に回す。
  let vehicleId: string | null = null;
  if (flow.customer_id && ctx.vehicle_text?.trim()) {
    const { data: vehicles } = await admin
      .from("vehicles")
      .select("id, maker, model, plate_display")
      .eq("tenant_id", tenantId)
      .eq("customer_id", flow.customer_id)
      .limit(10);
    const matched = matchVehicleByText((vehicles as VehicleTextCandidate[] | null) ?? [], ctx.vehicle_text);
    vehicleId = matched?.id ?? null;
  }

  const reservationId = crypto.randomUUID();
  const note = [
    "LINE 会話フローよりお客様が選択した日程で自動起票しました。",
    flow.quote_doc_id ? `見積り doc_id: ${flow.quote_doc_id}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1000);

  // ponytail: 基本の見積り明細は menu_items_json に含めない (LINE 会話フローの
  // 基本見積りは AI 起票の自由記述で、確定した品目 ID を持たないため)。Phase 2 で
  // 追加されたオプションのみ、登録メニュー由来なら実品目として反映する。天井:
  // workflowAuto/invoiceRecordAuto/accountingAuto/certificateAuto など
  // menu_items_json から品目名・金額を読む下流の自動処理は、基本明細ぶんは
  // 反映されない (オプションが選ばれた場合のみそのぶんが見える)。
  const selectedOptions = (flow.context_json[SELECTED_OPTIONS_KEY] as SelectedOptionRecord[] | undefined) ?? [];
  const menuItemsJson = selectedOptions.map((o) => ({ name: o.name, price: o.price, quantity: 1 }));

  const { error } = await admin.from("reservations").insert({
    id: reservationId,
    tenant_id: tenantId,
    store_id: await storeIdOrNull(admin, tenantId, "conversationFlowPostback"),
    customer_id: flow.customer_id,
    vehicle_id: vehicleId,
    title,
    scheduled_date: chosen.date,
    start_time: chosen.start_time,
    end_time: chosen.end_time,
    status: "confirmed",
    menu_items_json: menuItemsJson,
    estimated_amount: estimatedAmount,
    note,
  });
  if (error) {
    logger.warn("[conversationFlowPostback] reservation insert failed", { tenantId, err: error.message });
    return false;
  }

  await advanceFlow(admin, flow, {
    toState: "closed",
    reservationId,
    contextPatch: { confirmed_date: chosen.date, confirmed_start_time: chosen.start_time },
    expectState: "scheduled",
  });

  await sendCustomerLineText({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    body: buildReservationConfirmed(chosen),
  });
  await notifyStaffOfAiAction(
    admin,
    tenantId,
    "ご予約が自動登録されました",
    `お客様の日程選択により予約を自動登録しました（${chosen.date} ${chosen.start_time.slice(0, 5)}〜）。内容をご確認ください。`,
  );
  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_conversation_flow",
    resource: { kind: "reservation", id: reservationId },
    detail: { flow_id: flow.id, state: "closed", date: chosen.date, start_time: chosen.start_time },
  });

  // 案件登録時の勘定科目提案・ワークフロー提案 (管理画面の予約作成ルートと同じフック) と
  // Google カレンダー同期。いずれも opt-in / ベストエフォート (壁3 とは無関係、失敗しても
  // 予約自体は成立させる)。この処理は LINE webhook の after() 内 (レスポンス送出後) で走るため、
  // await してもお客様への 200 応答は遅れない。逆に await せず撃ちっぱなしにすると、外側の
  // after() コールバックが先に解決し、serverless 実行環境がこれら未完了の Promise を無言で
  // 打ち切り得る (PR #761 で直したのと同じクラスの不具合)。あえて関数末尾に置き、お客様への
  // 予約確定通知・スタッフ通知を先に済ませてから待つ (opt-in 時の LLM 呼び出しや gcal の
  // レイテンシで確定通知を遅らせないため)。3件は互いに独立なので Promise.all で並行実行し、
  // 各自でエラーを内包する (maybeAuto* は内部 try/catch、gcal は .catch) ため、1件の失敗が
  // 他や予約確定を壊さない。
  await Promise.all([
    maybeAutoCategorizeReservationOnIntake({ tenantId, reservationId }),
    maybeAutoProposeWorkflowForReservation({ tenantId, reservationId }),
    syncCreateEvent(tenantId, {
      id: reservationId,
      title,
      scheduled_date: chosen.date,
      start_time: chosen.start_time,
      end_time: chosen.end_time,
      note,
      customer_name: null,
      vehicle_label: null,
    }).catch((e) =>
      logger.warn("[conversationFlowPostback] gcal sync failed (non-blocking)", {
        tenantId,
        err: e instanceof Error ? e.message : String(e),
      }),
    ),
  ]);

  return true;
}

/** documents.items_json から明細 (item_type=item) の description 一覧を返す。取得失敗時は空配列。 */
async function fetchDocumentItemNames(admin: Admin, docId: string | null): Promise<string[]> {
  if (!docId) return [];
  const { data } = await admin.from("documents").select("items_json").eq("id", docId).maybeSingle();
  const items = (data as { items_json?: unknown } | null)?.items_json;
  if (!Array.isArray(items)) return [];
  return items
    .filter((it): it is { item_type?: string; description?: string } => !!it && typeof it === "object")
    .filter((it) => !it.item_type || it.item_type === "item")
    .map((it) => (typeof it.description === "string" ? it.description : ""))
    .filter(Boolean);
}

/**
 * 見積り内容が確定した (見積りOK / オプション不要 / 最終OK) 直後に、空き日程候補を
 * 取得して提示する。1 件も無ければスタッフ引き継ぎ。awaiting_quote_ok /
 * awaiting_option_confirm / awaiting_final_ok の 3 箇所から共通で呼ぶため、
 * `flow.state` (呼び出し時点の現在状態) をそのまま楽観ロックの expectState に使う。
 */
async function presentScheduleOrHandoff(
  admin: Admin,
  tenantId: string,
  flow: FlowRow,
  lineUserId: string,
  contextPatch: Record<string, unknown>,
): Promise<boolean> {
  const candidates = await fetchFlowScheduleCandidates(admin, tenantId, { limit: 3 });
  if (candidates.length === 0) {
    await advanceFlow(admin, flow, {
      toState: "human_takeover",
      contextPatch,
      expectState: flow.state,
    });
    await sendCustomerLineText({ tenantId, customerId: flow.customer_id, lineUserId, body: buildScheduleHandoff() });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "日程調整をお願いします",
      "お客様のお見積り内容が確定しました。空き日程候補が見つからなかったため、代車の空きとあわせて作業日程をご案内してください。",
    );
    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_conversation_flow",
      resource: { kind: "line_user", id: lineUserId },
      detail: { flow_id: flow.id, state: "human_takeover", ...contextPatch, no_candidates: true },
    });
    return true;
  }

  await advanceFlow(admin, flow, {
    toState: "awaiting_schedule_pick",
    contextPatch: { ...contextPatch, [SCHEDULE_CANDIDATES_KEY]: candidates },
    expectState: flow.state,
  });
  const askMsg = buildScheduleCandidatesAsk(candidates);
  await sendCustomerLineButtons({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    text: askMsg.text,
    buttons: askMsg.buttons,
  });
  await notifyStaffOfAiAction(
    admin,
    tenantId,
    "日程候補を提示しました",
    "お客様のお見積り内容が確定しました。日程候補を自動でご案内しています。選択があり次第、予約が自動登録されます。",
  );
  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_conversation_flow",
    resource: { kind: "line_user", id: lineUserId },
    detail: { flow_id: flow.id, state: "awaiting_schedule_pick", ...contextPatch, candidate_count: candidates.length },
  });
  return true;
}

/**
 * 提示済みのオプション候補から `index` 番目が選ばれたことを受けて、見積書に追加して
 * draft に戻す (Phase 2)。再送はスタッフの draft→sent 操作を経る (壁3 維持) ため、
 * ここでは顧客への案内とスタッフ通知のみ行う。
 * 呼び出し元 (handleFlowPostback) の catch で保護されるため、ここでは投げてよい。
 */
async function handleOptionSelected(
  admin: Admin,
  tenantId: string,
  flow: FlowRow,
  lineUserId: string,
  index: number,
): Promise<boolean> {
  const candidates = (flow.context_json[OPTION_CANDIDATES_KEY] as RecommendedOption[] | undefined) ?? [];
  const chosen = candidates[index];
  if (!chosen || !flow.quote_doc_id) return false;

  const selectedOption: SelectedOptionRecord = {
    name: chosen.name,
    price: chosen.price,
    menuItemId: chosen.menuItemId,
  };

  // 選択を排他的に確保する (楽観ロック)。handleSlotSelected と同じ理由 (postback
  // 再配信・連打による見積りへの二重追加を防ぐ)。見積り更新に先立って
  // awaiting_option_confirm → quote_drafted のクレームを取り、通ったリクエストだけが
  // 以降の見積書更新・顧客案内・スタッフ通知を行う。
  const claimed = await advanceFlow(admin, flow, {
    toState: "quote_drafted",
    contextPatch: { [SELECTED_OPTIONS_KEY]: [selectedOption] },
    expectState: "awaiting_option_confirm",
  });
  if (!claimed) return false;

  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: `オプション「${chosen.name}」を選択`,
    rawEvent: { flow_postback: `flow:option:${index}` },
  });

  const { data: doc, error: fetchError } = await admin
    .from("documents")
    .select("items_json, tax_rate, meta_json")
    .eq("id", flow.quote_doc_id)
    .maybeSingle();
  if (fetchError || !doc) {
    logger.warn("[conversationFlowPostback] option-select: quote document not found", {
      tenantId,
      docId: flow.quote_doc_id,
      err: fetchError?.message,
    });
    return false;
  }
  const existingItems = Array.isArray((doc as { items_json?: unknown }).items_json)
    ? ((doc as { items_json: unknown[] }).items_json as Array<Record<string, unknown>>)
    : [];
  const taxRate = (doc as { tax_rate?: number | null }).tax_rate ?? 10;
  // documents PUT ルートと同じ場所 (meta_json.is_tax_inclusive) から税込/税抜モードを
  // 読む。ここを見ずに税抜固定で再計算すると、税込モードの見積りを壊してしまう。
  const isTaxInclusive = !!(doc as { meta_json?: Record<string, unknown> | null }).meta_json?.is_tax_inclusive;
  // menu_items.unit_price (chosen.price) は常に税抜。税込モードの書類に追加するときは
  // 他の明細と揃うよう税込に換算してから渡す (そのまま渡すと税抜額を税込額として
  // 扱ってしまい、この行だけ税が乗らなくなる)。
  const optionUnitPrice = isTaxInclusive ? Math.round(chosen.price * (1 + taxRate / 100)) : chosen.price;

  const { itemsJson, subtotal, tax, total, taxBreakdown } = calcItems(
    [...existingItems, { item_type: "item", description: chosen.name, quantity: 1, unit_price: optionUnitPrice }],
    taxRate,
    isTaxInclusive,
  );

  // documents PUT ルートと同じ列を更新する (tax_breakdown も込みで — 適格請求書の
  // 複数税率区分表示や PDF がこれを参照するため、items_json/total だけの更新だと
  // 古い内訳が残ってしまう)。
  const { error: updateError } = await admin
    .from("documents")
    .update({ items_json: itemsJson, subtotal, tax, total, tax_breakdown: taxBreakdown, status: "draft" })
    .eq("id", flow.quote_doc_id);
  if (updateError) {
    // クレームは既に quote_drafted へ進んでいるが見積書自体の更新は失敗している。
    // まれなケースであり、ここでロールバックはせず (壁3: 送付はどのみち人が行う)
    // スタッフが気付けるようログのみ残す。
    logger.warn("[conversationFlowPostback] option-select: quote update failed", {
      tenantId,
      err: updateError.message,
    });
    return false;
  }

  await sendCustomerLineText({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    body: buildOptionAddedAck(chosen),
  });
  await notifyStaffOfAiAction(
    admin,
    tenantId,
    "オプション追加希望 — 見積りの再送をお願いします",
    `お客様が「${chosen.name}」の追加を希望されました。更新後のお見積り (合計 ¥${total.toLocaleString("ja-JP")}) を内容確認のうえ再送してください。`,
  );
  await logAutoActionExecuted({
    tenantId,
    actionKey: "inbound_message.auto_conversation_flow",
    resource: { kind: "document", id: flow.quote_doc_id },
    detail: { flow_id: flow.id, state: "quote_drafted", selected_option: chosen.name, total },
  });
  return true;
}
