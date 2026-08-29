/**
 * 受信メッセージ (予約の日程変更希望) → LINE で顧客セルフ日程変更の会話フローを起こす IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。intent=change_reservation
 * のとき、その顧客本人の「作業日の前日まで」の予約を提示し、空いている新しい日程候補を選んで
 * もらって即時反映する。当日・直前や対象なし・空き候補なし・未紐付けはスタッフに引き継ぐ。
 * 実際の日程更新と候補選択の処理は conversationFlowPostback.handleFlowPostback 側
 * (awaiting_reschedule_* 状態)。
 *
 * 安全ガード:
 *   - opt-in (inbound_message.auto_self_reschedule, 既定 OFF) + Standard プラン以上 + AI 有効
 *   - LINE 受信 (lineUserId あり) のみ
 *   - 対象は「本人 (line_user_id 紐付け) の予約」かつ「scheduled_date > 今日(JST)」= 前日まで
 *   - 進行中フローがあれば割り込まない (二重開始しない)
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { createFlow, getActiveFlow, advanceFlow } from "@/lib/line/flow/flowStore";
import {
  resolveCustomerIdByLineUser,
  RESCHEDULE_CANDIDATES_KEY,
  RESCHEDULE_TARGET_KEY,
  SCHEDULE_CANDIDATES_KEY,
} from "./conversationFlowPostback";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { fetchFlowScheduleCandidates, reservationDurationMinutes } from "@/lib/line/flow/scheduleCandidates";
import { addDays } from "@/lib/booking/slots";
import {
  buildReschedulePickAsk,
  buildRescheduleSlotAsk,
  buildCancelHandoff,
  type CancelTargetReservation,
} from "@/lib/line/flow/messages";
import { todayJst } from "@/lib/gantt/board";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation, notifyStaffOfAiAction } from "./policy";
import type { AiAutomationSettings } from "./policy";
import { shouldAutoSelfReschedule } from "./orchestrator";

export interface MaybeStartRescheduleFlowParams {
  tenantId: string;
  /** 既知顧客 ID。null なら line_user_id から解決を試みる。 */
  customerId: string | null;
  /** 返信先 LINE ユーザー ID。無ければ何もしない。 */
  lineUserId?: string | null;
  /** AI 抽出結果の intent。 */
  intent: string;
  /** 起票元 customer_messages.id (トレーサビリティ用)。 */
  messageId: string | null;
  channel?: string;
  /** 呼び出し元が取得済みなら渡して二重読込を避ける。 */
  settings?: AiAutomationSettings;
}

/**
 * 予約の日程変更のセルフ対応フローを開始する。処理したら true (呼び出し側は他の自動返信を
 * スキップする)。opt-in OFF / intent≠change_reservation / 進行中フロー有りなら false。失敗しても投げない。
 */
export async function maybeStartRescheduleFlow(params: MaybeStartRescheduleFlowParams): Promise<boolean> {
  const { tenantId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return false;
    if (params.intent !== "change_reservation") return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoSelfReschedule(settings)) return false;

    const admin = createServiceRoleAdmin("AI self-reschedule flow — LINE webhook lacks auth session");
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    // 顧客解決 (本番 webhook は customerId を渡さないことがある)。未紐付けはスタッフ引き継ぎ
    // — 本人の予約を特定できず、他人の予約を動かすリスクを避けるため。
    const customerId = params.customerId ?? (await resolveCustomerIdByLineUser(admin, tenantId, lineUserId));
    if (!customerId) {
      await sendCustomerLineText({ tenantId, customerId: null, lineUserId, body: buildCancelHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "予約の日程変更のご希望（未登録のお客様）— ご対応をお願いします",
        "未登録のお客様がLINEで予約の日程変更をご希望です。ご確認のうえご対応ください。",
      );
      return true;
    }

    // 進行中フロー (見積り等) があれば割り込まない。
    if (await getActiveFlow(admin, tenantId, { customerId, lineUserId })) return false;

    // 本人の「前日まで」の予約を取得。scheduled_date > 今日(JST) = 当日・過去を除外。
    const today = todayJst();
    const { data } = await admin
      .from("reservations")
      // end_time / loaner_car_id は変更先候補の精度向上 (実所要時間・代車要否) に使う。
      .select("id, scheduled_date, start_time, end_time, title, status, loaner_car_id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .gt("scheduled_date", today)
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: true })
      .limit(10);
    const rows =
      (data as Array<{
        id: string;
        scheduled_date: string;
        start_time: string | null;
        end_time: string | null;
        title: string | null;
        status: string | null;
        loaner_car_id: string | null;
      }> | null) ?? [];
    // クエリ (gt/neq) に加えてコード側でも締め切り・状態を確認する (二重ガード)。
    const eligible: CancelTargetReservation[] = rows
      .filter((r) => r.status !== "cancelled" && r.status !== "completed" && r.scheduled_date > today)
      .map((r) => ({
        id: r.id,
        scheduled_date: r.scheduled_date,
        start_time: r.start_time,
        title: r.title,
        duration_minutes: reservationDurationMinutes(r.start_time, r.end_time),
        needs_loaner: !!r.loaner_car_id,
      }));

    // 対象なし (当日/過去のみ、または予約なし) → スタッフ引き継ぎ。
    if (eligible.length === 0) {
      await sendCustomerLineText({ tenantId, customerId, lineUserId, body: buildCancelHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "予約の日程変更のご希望 — ご対応をお願いします",
        "お客様が予約の日程変更をご希望ですが、前日までにセルフ変更できる予約が見つかりませんでした（当日・直前の可能性）。ご確認ください。",
      );
      return true;
    }

    // 複数 → どれを変更するか選択へ。1 件 → 新日程候補の提示まで一気に進める。
    if (eligible.length > 1) {
      const flow = await createFlow(admin, {
        tenantId,
        customerId,
        lineUserId,
        state: "awaiting_reschedule_pick",
        context: { purpose: "reschedule", [RESCHEDULE_CANDIDATES_KEY]: eligible },
        lastMessageId: params.messageId,
      });
      if (!flow) return false; // 一意制約競合 (進行中フロー有) 等。二重送信しない。

      const msg = buildReschedulePickAsk(eligible);
      const delivered = await sendCustomerLineButtons({
        tenantId,
        customerId,
        lineUserId,
        text: msg.text,
        buttons: msg.buttons,
      });
      if (!delivered) {
        await advanceFlow(admin, flow, { toState: "expired", expectState: "awaiting_reschedule_pick" });
        logger.warn("[rescheduleFlowAuto] reschedule pick delivery failed", { tenantId, lineUserId });
        return false;
      }
      await logAutoActionExecuted({
        tenantId,
        actionKey: "inbound_message.auto_self_reschedule",
        resource: { kind: "line_user", id: lineUserId },
        detail: { flow_id: flow.id, state: "awaiting_reschedule_pick", target_count: eligible.length },
      });
      return true;
    }

    // 1 件 → 新しい日程候補を取得。空きが無ければスタッフ引き継ぎ (フローは作らない)。
    // 「前日まで」= 変更先も当日は不可なので翌日起点で候補を出す。
    const target = eligible[0];
    const slots = await fetchFlowScheduleCandidates(admin, tenantId, {
      limit: 3,
      fromDate: addDays(today, 1),
      excludeReservationId: target.id,
      // 変更先候補を元予約の実所要時間・代車要否で絞る。作業はあるがカテゴリ不明なので
      // 受入制限枠は提案しない (excludeRestricted)。
      estimatedMinutes: target.duration_minutes,
      needsLoaner: target.needs_loaner,
      excludeRestricted: true,
    });
    if (slots.length === 0) {
      await sendCustomerLineText({ tenantId, customerId, lineUserId, body: buildCancelHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "日程変更の候補が見つかりません — ご対応をお願いします",
        "お客様が予約の日程変更をご希望ですが、空き日程候補が見つかりませんでした。代車の空きとあわせてご相談ください。",
      );
      return true;
    }

    const flow = await createFlow(admin, {
      tenantId,
      customerId,
      lineUserId,
      state: "awaiting_reschedule_slot",
      context: { purpose: "reschedule", [RESCHEDULE_TARGET_KEY]: target, [SCHEDULE_CANDIDATES_KEY]: slots },
      reservationId: target.id,
      lastMessageId: params.messageId,
    });
    if (!flow) return false;

    const msg = buildRescheduleSlotAsk(target, slots);
    const delivered = await sendCustomerLineButtons({
      tenantId,
      customerId,
      lineUserId,
      text: msg.text,
      buttons: msg.buttons,
    });
    if (!delivered) {
      await advanceFlow(admin, flow, { toState: "expired", expectState: "awaiting_reschedule_slot" });
      logger.warn("[rescheduleFlowAuto] reschedule slot delivery failed", { tenantId, lineUserId });
      return false;
    }
    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_self_reschedule",
      resource: { kind: "reservation", id: target.id },
      detail: { flow_id: flow.id, state: "awaiting_reschedule_slot", candidate_count: slots.length },
    });
    return true;
  } catch (e) {
    logger.warn("[rescheduleFlowAuto] maybeStartRescheduleFlow threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
