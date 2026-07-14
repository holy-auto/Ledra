/**
 * 未登録車両の入庫日、LINEで車検証撮影を依頼し自動登録する — IO 層 (Phase 3)。
 *
 *   A. 入庫日 (cron) — LINE 会話フロー経由で確定した予約のうち、車両未登録の
 *      ものについて車検証撮影を依頼する (promptVehicleCaptureIfNeeded、
 *      /api/cron/vehicle-capture-prompt から呼ぶ)。フロー本体
 *      (line_conversation_flows) とは独立した後続フローとして、この予約専用に
 *      新しいフロー行を `awaiting_vehicle_photo` で作成する。
 *   B. 顧客が写真を送信 (LINE webhook) — awaiting_vehicle_photo 中のフローが
 *      あれば OCR → 車両登録 → 予約への紐付けを行いフローをクローズする
 *      (handleVehiclePhotoMessage、line/client.ts から呼ぶ)。OCR 失敗・
 *      メーカー不明ならスタッフ引き継ぎ (勝手に不正確な車両を作らない)。
 *
 * 車両 (vehicle_id) が予約に付けば、既存の証明書自動化
 * (certificate.auto_create_draft_record 等、vehicle_id 必須) が案件完了時に
 * 通常どおり働く — このフェーズはその前段を埋めるだけで、証明書側には手を入れない。
 *
 * すべて opt-in (vehicle.auto_capture_via_line) + fail-soft。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendCustomerLineText } from "@/lib/line/client";
import { recordInboundLineMessage } from "@/lib/line/messageStore";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import {
  getActiveFlow,
  createFlow,
  advanceFlow,
  getFlowsByReservationId,
  type ConversationFlowRow,
} from "@/lib/line/flow/flowStore";
import {
  buildVehiclePhotoRequest,
  buildVehiclePhotoRegistered,
  buildVehiclePhotoFailedHandoff,
} from "@/lib/line/flow/messages";
import { parseShakenshoAuto } from "@/lib/ocr/shakensho";
import { createVehicleFromShakensho } from "@/lib/vehicles/createFromShakensho";
import {
  loadAiAutomationSettings,
  isSourceAllowed,
  tenantEligibleForAiAutomation,
  notifyStaffOfAiAction,
} from "./policy";
import { shouldAutoCaptureVehicleViaLine } from "./orchestrator";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** この予約専用の車両撮影フローかどうかを区別する context の目印キー/値。 */
export const FLOW_PURPOSE_KEY = "purpose";
export const FLOW_PURPOSE_VEHICLE_CAPTURE = "vehicle_capture";

export interface ReservationForCapture {
  id: string;
  customer_id: string | null;
}

/**
 * 入庫日を迎えた予約について、車両未登録なら車検証撮影を依頼する。既にこの予約に
 * 対する撮影フローがあれば (成功/失敗問わず) 再送しない。処理したら true。
 *
 * `knownFlows` を渡すと、この予約に紐づくフロー行の再取得をスキップする
 * (呼び出し側の cron が LINE 起源判定のため既に取得済みの場合の重複クエリ回避)。
 */
export async function promptVehicleCaptureIfNeeded(
  admin: Admin,
  tenantId: string,
  reservation: ReservationForCapture,
  knownFlows?: ConversationFlowRow[],
): Promise<boolean> {
  try {
    if (!reservation.customer_id) return false;
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoCaptureVehicleViaLine(settings)) return false;
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    const existingFlows = knownFlows ?? (await getFlowsByReservationId(admin, tenantId, reservation.id));
    if (existingFlows.some((f) => f.context_json[FLOW_PURPOSE_KEY] === FLOW_PURPOSE_VEHICLE_CAPTURE)) return false;

    const { data: customer } = await admin
      .from("customers")
      .select("line_user_id")
      .eq("id", reservation.customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const lineUserId = (customer as { line_user_id?: string | null } | null)?.line_user_id?.trim();
    if (!lineUserId) return false;

    // 進行中の別フロー (商談中など) と競合する場合は割り込まない
    // (line_conversation_flows の一意制約違反で createFlow が自然に null を返す)。
    // ponytail: この一意制約は (tenant_id, customer_id) 単位 (スレッド単位) のため、
    // 同一顧客が同日に複数台の入庫予約を持つ場合、2台目以降はここで競合しスキップ
    // される (cron は scheduled_date=当日のみを見るため以降リトライされない)。天井:
    // 同一顧客・同日複数台のケースは稀と判断し許容。upgrade path: 一意制約を
    // (tenant_id, customer_id, reservation_id) に変更する移行を行うか、1台目の
    // フローが closed になった時点で同顧客の未処理予約を連鎖的に開始する。
    const flow = await createFlow(admin, {
      tenantId,
      customerId: reservation.customer_id,
      lineUserId,
      state: "awaiting_vehicle_photo",
      context: { [FLOW_PURPOSE_KEY]: FLOW_PURPOSE_VEHICLE_CAPTURE },
      reservationId: reservation.id,
    });
    if (!flow) return false;

    const delivered = await sendCustomerLineText({
      tenantId,
      customerId: reservation.customer_id,
      lineUserId,
      body: buildVehiclePhotoRequest(),
    });
    if (!delivered) {
      logger.warn("[vehicleCaptureAuto] photo request delivery failed", { tenantId, lineUserId });
      return false;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "vehicle.auto_capture_via_line",
      resource: { kind: "reservation", id: reservation.id },
      detail: { flow_id: flow.id, state: "awaiting_vehicle_photo" },
    });
    return true;
  } catch (e) {
    logger.warn("[vehicleCaptureAuto] promptVehicleCaptureIfNeeded threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/**
 * 顧客が画像を送ってきた時点で、進行中の車両撮影フローがあれば OCR → 車両登録 →
 * 予約への紐付けを行う。処理したら true (呼び出し側は通常の受信箱記録をスキップ)。
 * 対象フローが無ければ false。失敗しても投げない。
 *
 * LINE の webhook 再配信や連続送信で同じフローに対し二重に呼ばれても、OCR/登録の
 * 副作用を起こす前に `processing_vehicle_photo` へ排他クレームする
 * (advanceFlow の expectState 楽観ロック)。クレームに負けた側は即 false を返す。
 */
export async function handleVehiclePhotoMessage(params: {
  tenantId: string;
  lineUserId: string;
  customerId?: string | null;
  imageBuffer: Buffer;
  attachmentPath?: string | null;
  attachmentContentType?: string | null;
  lineMessageId?: string | null;
}): Promise<boolean> {
  const { tenantId, lineUserId, imageBuffer } = params;
  try {
    const admin = createServiceRoleAdmin("AI vehicle capture (photo) — no auth session");
    const flow = await getActiveFlow(admin, tenantId, { customerId: params.customerId, lineUserId });
    if (!flow || flow.state !== "awaiting_vehicle_photo") return false;
    if (!(await tenantEligibleForAiAutomation(admin, tenantId))) return false;

    const claimed = await advanceFlow(admin, flow, {
      toState: "processing_vehicle_photo",
      expectState: "awaiting_vehicle_photo",
    });
    if (!claimed) return false;

    // 顧客の送信をスレッドに残す (画像は client.ts が既に line-media に保存済みのため
    // その参照も一緒に記録する — 受信箱で写真を確認できるようにする)。
    await recordInboundLineMessage({
      tenantId,
      lineUserId,
      body: "[車検証の写真を送信]",
      rawEvent: { flow_photo: true },
      lineMessageId: params.lineMessageId ?? null,
      attachmentPath: params.attachmentPath ?? null,
      attachmentContentType: params.attachmentContentType ?? null,
    });

    const settings = await loadAiAutomationSettings(tenantId);
    // AI マスタースイッチ OFF / 身分証書類ソース OFF なら OCR を呼ばず引き継ぐ
    // (parse-shakken ルートと同じゲート)。
    if (!isSourceAllowed(settings, "identity_documents")) {
      return handoffVehiclePhoto(admin, tenantId, flow, lineUserId, "AI 自動入力が無効になっているため");
    }

    const { data: parsed } = await parseShakenshoAuto(imageBuffer, { requireFields: ["maker"] });
    if (!parsed.maker || !flow.customer_id) {
      return handoffVehiclePhoto(admin, tenantId, flow, lineUserId, "車検証からメーカーを読み取れなかったため");
    }

    const vehicleId = await createVehicleFromShakensho(admin, {
      tenantId,
      customerId: flow.customer_id,
      data: parsed,
    });
    if (!vehicleId) {
      return handoffVehiclePhoto(admin, tenantId, flow, lineUserId, "車両の登録に失敗したため");
    }

    const reservationId = flow.reservation_id ?? null;
    if (reservationId) {
      // OCR 中にスタッフが管理画面で正しい車両を手動割当て済みなら上書きしない。
      const { error } = await admin
        .from("reservations")
        .update({ vehicle_id: vehicleId })
        .eq("id", reservationId)
        .is("vehicle_id", null);
      if (error) {
        logger.warn("[vehicleCaptureAuto] reservation vehicle_id update failed", {
          tenantId,
          reservationId,
          err: error.message,
        });
      }
    }

    await advanceFlow(admin, flow, {
      toState: "closed",
      contextPatch: { vehicle_id: vehicleId },
      expectState: "processing_vehicle_photo",
    });

    const vehicleLabel = [parsed.maker, parsed.model].filter(Boolean).join(" ") || "お車";
    await sendCustomerLineText({
      tenantId,
      customerId: flow.customer_id,
      lineUserId,
      body: buildVehiclePhotoRegistered(vehicleLabel),
    });
    await notifyStaffOfAiAction(
      admin,
      tenantId,
      "車検証の写真から車両を自動登録しました",
      `${vehicleLabel} を自動登録しました。内容をご確認ください。`,
    );
    await logAutoActionExecuted({
      tenantId,
      actionKey: "vehicle.auto_capture_via_line",
      resource: { kind: "vehicle", id: vehicleId },
      detail: { flow_id: flow.id, state: "closed", reservation_id: reservationId },
    });
    return true;
  } catch (e) {
    logger.warn("[vehicleCaptureAuto] handleVehiclePhotoMessage threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/** OCR 読み取り失敗などでスタッフに引き継ぐ (fail-soft、常に true を返す)。 */
async function handoffVehiclePhoto(
  admin: Admin,
  tenantId: string,
  flow: ConversationFlowRow,
  lineUserId: string,
  reason: string,
): Promise<boolean> {
  await advanceFlow(admin, flow, {
    toState: "human_takeover",
    contextPatch: { vehicle_capture_failed: reason },
    expectState: "processing_vehicle_photo",
  });
  await sendCustomerLineText({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    body: buildVehiclePhotoFailedHandoff(),
  });
  await notifyStaffOfAiAction(
    admin,
    tenantId,
    "車検証の自動読み取りに失敗しました",
    `${reason}。お客様の車両情報を手動でご確認ください。`,
  );
  await logAutoActionExecuted({
    tenantId,
    actionKey: "vehicle.auto_capture_via_line",
    resource: { kind: "line_user", id: lineUserId },
    detail: { flow_id: flow.id, state: "human_takeover", reason },
  });
  return true;
}
