/**
 * 会話フローの「応答取り込み」IO 層 — 可否ゲート (Phase 1b-2) + 日程調整 (Phase 1b-3)。
 *
 *   A. スタッフが正式見積書を送付 (draft→sent) した時点で、その見積りに紐づく
 *      フローを quote_drafted → awaiting_quote_ok へ進め、顧客に可否ボタンを送る
 *      (maybeAdvanceFlowOnQuoteSent、documents PUT から呼ぶ)。
 *   B. 顧客が可否ボタン (postback) を押した時点で分岐する (handleFlowPostback、
 *      LINE webhook の postback から呼ぶ):
 *        - はい → 空き日程候補を取得しボタン提示 (候補ゼロならスタッフ引き継ぎ)
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
 * 予約作成は顧客自身の明示的な承認 (見積りOK→日程選択) を経ているため、AI テキスト
 * 抽出からの自動起票 (inboundAuto.ts) と異なり「【要確認】」は付けない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { recordInboundLineMessage } from "@/lib/line/messageStore";
import { syncCreateEvent } from "@/lib/gcal/client";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { getActiveFlow, getFlowByQuoteDoc, advanceFlow } from "@/lib/line/flow/flowStore";
import { interpretReply } from "@/lib/line/flow/interpret";
import { fetchFlowScheduleCandidates, type FlowScheduleCandidate } from "@/lib/line/flow/scheduleCandidates";
import { maybeAutoCategorizeReservationOnIntake } from "./accountingAuto";
import { maybeAutoProposeWorkflowForReservation } from "./workflowAuto";
import {
  buildQuoteApprovalAsk,
  buildScheduleHandoff,
  buildQuoteConsultHandoff,
  buildScheduleCandidatesAsk,
  buildScheduleConflictHandoff,
  buildReservationConfirmed,
} from "@/lib/line/flow/messages";
import { loadAiAutomationSettings } from "./policy";
import { shouldRunConversationFlow, shouldAutoSendDocumentOnConfirm } from "./orchestrator";

/** 提示した日程候補を提示順のまま保持するための context キー。 */
const SCHEDULE_CANDIDATES_KEY = "schedule_candidates";

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

      // OK → 空き日程候補を取得して提示 (Phase 1b-3)。1 件も無ければスタッフ引き継ぎ
      // (既存の buildScheduleHandoff 文面を「担当より候補を連絡します」の案内として再利用)。
      const candidates = await fetchFlowScheduleCandidates(admin, tenantId, { limit: 3 });
      if (candidates.length === 0) {
        await advanceFlow(admin, flow, {
          toState: "human_takeover",
          contextPatch: { quote_decision: "ok" },
          expectState: "awaiting_quote_ok",
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
          "見積りOK — 日程調整をお願いします",
          "お客様が見積り内容にOKされました。空き日程候補が見つからなかったため、代車の空きとあわせて作業日程をご案内してください。",
        );
        await logAutoActionExecuted({
          tenantId,
          actionKey: "inbound_message.auto_conversation_flow",
          resource: { kind: "line_user", id: lineUserId },
          detail: { flow_id: flow.id, state: "human_takeover", quote_decision: "ok", no_candidates: true },
        });
        return true;
      }

      await advanceFlow(admin, flow, {
        toState: "awaiting_schedule_pick",
        contextPatch: { quote_decision: "ok", [SCHEDULE_CANDIDATES_KEY]: candidates },
        expectState: "awaiting_quote_ok",
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
        "見積りOK — 日程候補を提示しました",
        "お客様が見積り内容にOKされました。日程候補を自動でご案内しています。選択があり次第、予約が自動登録されます。",
      );
      await logAutoActionExecuted({
        tenantId,
        actionKey: "inbound_message.auto_conversation_flow",
        resource: { kind: "line_user", id: lineUserId },
        detail: { flow_id: flow.id, state: "awaiting_schedule_pick", candidate_count: candidates.length },
      });
      return true;
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
  flow: {
    id: string;
    customer_id: string | null;
    line_user_id: string | null;
    context_json: Record<string, unknown>;
    quote_doc_id: string | null;
  },
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

  // ponytail: menu_items_json は空のまま起票する (LINE 会話フローは確定した品目
  // ID を持たないため)。天井: workflowAuto/invoiceRecordAuto/accountingAuto/
  // certificateAuto など menu_items_json から品目名・金額を読む下流の自動処理は
  // この予約に対しては空リストとして扱われる。Phase 2 でオプション確認時に品目 ID
  // を確定できるようになったら、その内容をここに渡す。
  const { error } = await admin.from("reservations").insert({
    id: reservationId,
    tenant_id: tenantId,
    customer_id: flow.customer_id,
    title,
    scheduled_date: chosen.date,
    start_time: chosen.start_time,
    end_time: chosen.end_time,
    status: "confirmed",
    menu_items_json: [],
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
