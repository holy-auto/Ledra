/**
 * 受信メッセージ (作業状況の問い合わせ) → 本人の直近予約の状況を LINE で自動返信する IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。intent=status_inquiry の
 * とき、その顧客本人の「今いちばん関係する予約」(作業中/来店受付 → 直近の未来予約 → 直近の完了)
 * の状況を、稼働中の reservations.status に対応する顧客向け文言で返す。特定できない・未紐付けは
 * スタッフに引き継ぐ。
 *
 * 安全ガード:
 *   - opt-in (inbound_message.auto_status_reply, 既定 OFF) + Standard プラン以上 + AI 有効
 *   - LINE 受信 (lineUserId あり) のみ
 *   - 本人 (line_user_id 紐付け) の予約しか答えない (他人の予約状況を漏らさない)
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { resolveCustomerIdByLineUser } from "./conversationFlowPostback";
import { sendCustomerLineText } from "@/lib/line/client";
import { buildWorkStatusReply, buildWorkStatusHandoff, type WorkStatusReservation } from "@/lib/line/flow/messages";
import { todayJst } from "@/lib/gantt/board";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, tenantEligibleForAiAutomation, notifyStaffOfAiAction } from "./policy";
import type { AiAutomationSettings } from "./policy";
import { shouldAutoReplyStatus } from "./orchestrator";

export interface MaybeReplyWorkStatusParams {
  tenantId: string;
  customerId: string | null;
  lineUserId?: string | null;
  intent: string;
  messageId: string | null;
  channel?: string;
  settings?: AiAutomationSettings;
}

type ReservationRow = {
  id: string;
  status: string | null;
  scheduled_date: string;
  start_time: string | null;
  title: string | null;
  progress_pct: number | null;
};

/**
 * 「今いちばん関係する予約」を選ぶ: 作業中/来店受付 (進行中) → 直近の未来予約 → 直近の完了。
 * 未来予約は最も近い日、進行中・完了は最も新しい日を採用する。
 */
function pickRelevant(rows: ReservationRow[], today: string): ReservationRow | null {
  const active = rows
    .filter((r) => r.status === "in_progress" || r.status === "arrived")
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
  if (active.length > 0) return active[0];

  const upcoming = rows
    .filter((r) => r.status === "confirmed" && r.scheduled_date >= today)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  if (upcoming.length > 0) return upcoming[0];

  const completed = rows
    .filter((r) => r.status === "completed")
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
  if (completed.length > 0) return completed[0];

  return null;
}

/**
 * 作業状況の問い合わせに自動返信する。処理したら true (呼び出し側は他の自動返信をスキップ)。
 * opt-in OFF / intent≠status_inquiry なら false。失敗しても投げない。
 */
export async function maybeReplyWorkStatus(params: MaybeReplyWorkStatusParams): Promise<boolean> {
  const { tenantId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return false;
    if (params.intent !== "status_inquiry") return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoReplyStatus(settings)) return false;

    const admin = createServiceRoleAdmin("AI status reply — LINE webhook lacks auth session");
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    // 本人確認: 紐付け済み顧客のみ。未紐付けは本人の予約を特定できず、他人の状況を答えないため引き継ぐ。
    const customerId = params.customerId ?? (await resolveCustomerIdByLineUser(admin, tenantId, lineUserId));
    if (!customerId) {
      await sendCustomerLineText({ tenantId, customerId: null, lineUserId, body: buildWorkStatusHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "予約状況のお問い合わせ（未登録のお客様）— ご対応をお願いします",
        "未登録のお客様がLINEで予約・作業状況をお問い合わせです。ご確認のうえご対応ください。",
      );
      return true;
    }

    // 本人の未キャンセル予約 (直近)。過去の完了も含めたいので日付では絞らず新しい順に少量取る。
    const { data } = await admin
      .from("reservations")
      .select("id, status, scheduled_date, start_time, title, progress_pct")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: false })
      .limit(20);
    const rows = ((data as ReservationRow[] | null) ?? []).filter((r) => r.status !== "cancelled");

    const target = pickRelevant(rows, todayJst());
    if (!target) {
      // 対象なし → 状況を断定せずスタッフへ。
      await sendCustomerLineText({ tenantId, customerId, lineUserId, body: buildWorkStatusHandoff() });
      await notifyStaffOfAiAction(
        admin,
        tenantId,
        "予約状況のお問い合わせ — ご対応をお願いします",
        "お客様が予約・作業状況をお問い合わせですが、対象の予約が見つかりませんでした。ご確認ください。",
      );
      return true;
    }

    const reservation: WorkStatusReservation = {
      status: target.status ?? "",
      scheduled_date: target.scheduled_date,
      start_time: target.start_time,
      title: target.title,
      progress_pct: target.progress_pct,
    };
    const delivered = await sendCustomerLineText({
      tenantId,
      customerId,
      lineUserId,
      body: buildWorkStatusReply(reservation),
    });
    if (!delivered) {
      logger.warn("[statusReplyAuto] status reply delivery failed", { tenantId, lineUserId });
      return false;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "inbound_message.auto_status_reply",
      resource: { kind: "reservation", id: target.id },
      detail: { status: target.status, channel: params.channel ?? "line" },
    });
    return true;
  } catch (e) {
    logger.warn("[statusReplyAuto] maybeReplyWorkStatus threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
