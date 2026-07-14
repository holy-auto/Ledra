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
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { recordInboundLineMessage } from "@/lib/line/messageStore";
import { syncCreateEvent } from "@/lib/gcal/client";
import { calcItems } from "@/lib/documents/calcItems";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { getActiveFlow, getFlowByQuoteDoc, advanceFlow, type ConversationFlowRow } from "@/lib/line/flow/flowStore";
import { interpretReply } from "@/lib/line/flow/interpret";
import { fetchFlowScheduleCandidates, type FlowScheduleCandidate } from "@/lib/line/flow/scheduleCandidates";
import { fetchAddonRecommendations } from "@/lib/line/flow/addonCandidates";
import type { RecommendedOption } from "@/lib/ai/optionRecommend";
import { maybeAutoCategorizeReservationOnIntake } from "./accountingAuto";
import { maybeAutoProposeWorkflowForReservation } from "./workflowAuto";
import {
  buildQuoteApprovalAsk,
  buildScheduleHandoff,
  buildQuoteConsultHandoff,
  buildScheduleCandidatesAsk,
  buildScheduleConflictHandoff,
  buildReservationConfirmed,
  buildOptionRecommendAsk,
  buildOptionAddedAck,
  buildFinalQuoteApprovalAsk,
} from "@/lib/line/flow/messages";
import { loadAiAutomationSettings } from "./policy";
import { shouldRunConversationFlow, shouldAutoSendDocumentOnConfirm } from "./orchestrator";

/** 提示した日程候補を提示順のまま保持するための context キー。 */
const SCHEDULE_CANDIDATES_KEY = "schedule_candidates";
/** 提示したオプション候補を提示順のまま保持するための context キー。 */
const OPTION_CANDIDATES_KEY = "option_candidates";
/** 追加が確定したオプション (最終見積り再送の要否判定・予約の menu_items_json にも使う) の context キー。 */
const SELECTED_OPTIONS_KEY = "selected_options";

/** context_json[SELECTED_OPTIONS_KEY] の要素の形。 */
interface SelectedOptionRecord {
  name: string;
  price: number;
  menuItemId: string | null;
}

type Admin = ReturnType<typeof createServiceRoleAdmin>;
type FlowRow = ConversationFlowRow;

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
    if (!(await tenantEligible(admin, tenantId))) return;
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
    if (!shouldRunConversationFlow(settings)) return false;

    const admin = createServiceRoleAdmin("AI conversation flow (postback) — no auth session");
    const flow = await getActiveFlow(admin, tenantId, { customerId: params.customerId, lineUserId });
    if (!flow) return false;

    const event = interpretReply(flow.state, { postbackData: params.data });
    if (!event) return false;
    if (!(await tenantEligible(admin, tenantId))) return false;

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
        await notifyStaff(
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
      await notifyStaff(
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
        await notifyStaff(
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
      await notifyStaff(
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
    await notifyStaff(
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

  const ctx = flow.context_json as { service?: string | null };
  const title = (ctx.service?.trim() || "LINEご予約").slice(0, 200);

  let estimatedAmount = 0;
  if (flow.quote_doc_id) {
    const { data: doc } = await admin.from("documents").select("total").eq("id", flow.quote_doc_id).maybeSingle();
    estimatedAmount = (doc as { total?: number } | null)?.total ?? 0;
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
    customer_id: flow.customer_id,
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

  // 案件登録時の勘定科目提案・ワークフロー提案 (管理画面の予約作成ルートと同じフック)。
  // いずれも opt-in + 提案の保存のみ (壁3 とは無関係)。レスポンスを遅らせないよう待たない。
  void maybeAutoCategorizeReservationOnIntake({ tenantId, reservationId });
  void maybeAutoProposeWorkflowForReservation({ tenantId, reservationId });

  // Google カレンダー同期 (非ブロッキング、失敗しても予約自体は成立させる)。
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
  );

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
  await notifyStaff(
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
    await notifyStaff(
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
  await notifyStaff(
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

  await recordInboundLineMessage({
    tenantId,
    lineUserId,
    body: `オプション「${chosen.name}」を選択`,
    rawEvent: { flow_postback: `flow:option:${index}` },
  });

  const { data: doc, error: fetchError } = await admin
    .from("documents")
    .select("items_json, tax_rate")
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

  const { itemsJson, subtotal, tax, total } = calcItems(
    [...existingItems, { item_type: "item", description: chosen.name, quantity: 1, unit_price: chosen.price }],
    taxRate,
    false,
  );

  const selectedOption: SelectedOptionRecord = {
    name: chosen.name,
    price: chosen.price,
    menuItemId: chosen.menuItemId,
  };
  const { error: updateError } = await admin
    .from("documents")
    .update({ items_json: itemsJson, subtotal, tax, total, status: "draft" })
    .eq("id", flow.quote_doc_id);
  if (updateError) {
    logger.warn("[conversationFlowPostback] option-select: quote update failed", {
      tenantId,
      err: updateError.message,
    });
    return false;
  }

  await advanceFlow(admin, flow, {
    toState: "quote_drafted",
    contextPatch: { [SELECTED_OPTIONS_KEY]: [selectedOption] },
    expectState: "awaiting_option_confirm",
  });

  await sendCustomerLineText({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    body: buildOptionAddedAck(chosen),
  });
  await notifyStaff(
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
