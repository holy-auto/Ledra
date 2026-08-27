/**
 * 受信メッセージ (予約キャンセル希望) → LINE で顧客セルフキャンセルの会話フローを起こす IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。intent=cancel の
 * とき、その顧客本人の「作業日の前日まで」の予約を提示し、確認ボタンで即時キャンセルさせる。
 * 当日・直前や対象なし・未紐付けはスタッフに引き継ぐ。実際のキャンセル実行と確認ボタンの
 * 処理は conversationFlowPostback.handleFlowPostback 側 (awaiting_cancel_* 状態)。
 *
 * 安全ガード:
 *   - opt-in (inbound_message.auto_self_cancel, 既定 OFF) + Standard プラン以上 + AI 有効
 *   - LINE 受信 (lineUserId あり) のみ
 *   - 対象は「本人 (line_user_id 紐付け) の予約」かつ「scheduled_date > 今日(JST)」= 前日まで
 *   - 破壊的操作なので提示のみ。確定は必ず本人の確認ボタン (handleFlowPostback)
 *   - 進行中フローがあれば割り込まない (二重開始しない)
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { createFlow, getActiveFlow } from "@/lib/line/flow/flowStore";
import { resolveCustomerIdByLineUser, CANCEL_CANDIDATES_KEY } from "./conversationFlowPostback";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import {
  buildCancelPickAsk,
  buildCancelConfirmAsk,
  buildCancelHandoff,
  type CancelTargetReservation,
} from "@/lib/line/flow/messages";
import { todayJst } from "@/lib/gantt/board";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation, notifyStaffOfAiAction } from "./policy";
import type { AiAutomationSettings } from "./policy";
import { shouldAutoSelfCancel } from "./orchestrator";

export interface MaybeStartCancelFlowParams {
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
 * 予約キャンセルのセルフ対応フローを開始する。処理したら true (呼び出し側は他の自動返信を
 * スキップする)。opt-in OFF / intent≠cancel / 進行中フロー有りなら false。失敗しても投げない。
 */
export async function maybeStartCancelFlow(params: MaybeStartCancelFlowParams): Promise<boolean> {
  const { tenantId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return false;
    if (params.intent !== "cancel") return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoSelfCancel(settings)) return false;

    const admin = createServiceRoleAdmin("AI self-cancel flow — LINE webhook lacks auth session");
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    // 顧客解決 (本番 webhook は customerId を渡さないことがある)。未紐付けはスタッフ引き継ぎ
    // — 本人の予約を特定できず、他人の予約を消すリスクを避けるため。
    const customerId = params.customerId ?? (await resolveCustomerIdByLineUser(admin, tenantId, lineUserId));
    if (!customerId) {
      await sendCustomerLineText({ tenantId, customerId: null, lineUserId, body: buildCancelHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "予約キャンセルのご希望（未登録のお客様）— ご対応をお願いします",
        "未登録のお客様がLINEで予約のキャンセルをご希望です。ご確認のうえご対応ください。",
      );
      return true;
    }

    // 進行中フロー (見積り等) があれば割り込まない。
    if (await getActiveFlow(admin, tenantId, { customerId, lineUserId })) return false;

    // 本人の「前日まで」の予約を取得。scheduled_date > 今日(JST) = 当日・過去を除外。
    const today = todayJst();
    const { data } = await admin
      .from("reservations")
      .select("id, scheduled_date, start_time, title, status")
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
        title: string | null;
        status: string | null;
      }> | null) ?? [];
    // クエリ (gt/neq) に加えてコード側でも締め切り・状態を確認する (二重ガード)。
    // 「前日まで」= scheduled_date が今日より後 (当日・過去は除外)。
    const eligible: CancelTargetReservation[] = rows
      .filter((r) => r.status !== "cancelled" && r.status !== "completed" && r.scheduled_date > today)
      .map((r) => ({ id: r.id, scheduled_date: r.scheduled_date, start_time: r.start_time, title: r.title }));

    // 対象なし (当日/過去のみ、または予約なし) → スタッフ引き継ぎ。
    if (eligible.length === 0) {
      await sendCustomerLineText({ tenantId, customerId, lineUserId, body: buildCancelHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "予約キャンセルのご希望 — ご対応をお願いします",
        "お客様が予約のキャンセルをご希望ですが、前日までにセルフキャンセルできる予約が見つかりませんでした（当日・直前の可能性）。ご確認ください。",
      );
      return true;
    }

    // 1件 → いきなり確認へ。複数 → どれを消すか選択へ。context に候補を保持する。
    const single = eligible.length === 1;
    const flow = await createFlow(admin, {
      tenantId,
      customerId,
      lineUserId,
      state: single ? "awaiting_cancel_confirm" : "awaiting_cancel_pick",
      context: { purpose: "cancel", [CANCEL_CANDIDATES_KEY]: eligible },
      reservationId: single ? eligible[0].id : null,
      lastMessageId: params.messageId,
    });
    if (!flow) return false; // 一意制約競合 (進行中フロー有) 等。二重送信しない。

    const msg = single ? buildCancelConfirmAsk(eligible[0]) : buildCancelPickAsk(eligible);
    const delivered = await sendCustomerLineButtons({
      tenantId,
      customerId,
      lineUserId,
      text: msg.text,
      buttons: msg.buttons,
    });
    if (!delivered) {
      logger.warn("[cancelFlowAuto] cancel prompt delivery failed", { tenantId, lineUserId });
      return false;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_self_cancel",
      resource: single ? { kind: "reservation", id: eligible[0].id } : { kind: "line_user", id: lineUserId },
      detail: {
        flow_id: flow.id,
        state: single ? "awaiting_cancel_confirm" : "awaiting_cancel_pick",
        target_count: eligible.length,
        channel: params.channel ?? "line",
      },
    });
    return true;
  } catch (e) {
    logger.warn("[cancelFlowAuto] maybeStartCancelFlow threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
