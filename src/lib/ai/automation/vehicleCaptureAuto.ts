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
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
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
import { loadAiAutomationSettings, isSourceAllowed } from "./policy";
import { shouldAutoCaptureVehicleViaLine } from "./orchestrator";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** この予約専用の車両撮影フローかどうかを区別する context の目印キー/値。 */
export const FLOW_PURPOSE_KEY = "purpose";
export const FLOW_PURPOSE_VEHICLE_CAPTURE = "vehicle_capture";

/** テナントが有効 + AI 会話フローのプラン要件を満たすか (他のフロー入口と同じガード)。 */
async function tenantEligible(admin: Admin, tenantId: string): Promise<boolean> {
  const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
  if (!tenant || tenant.is_active === false) return false;
  return canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract");
}

/** スタッフに「この後の対応」を促す通知 (fail-soft)。 */
async function notifyStaff(admin: Admin, tenantId: string, title: string, body: string): Promise<void> {
  const { error } = await admin.from("notifications").insert({
    tenant_id: tenantId,
    user_id: null,
    notification_type: "ai_action",
    priority: "normal",
    title,
    body,
    link_path: "/admin/messages",
  });
  if (error) logger.warn("[vehicleCaptureAuto] notify failed", { tenantId, err: error.message });
}

export interface ReservationForCapture {
  id: string;
  customer_id: string | null;
}

/**
 * 入庫日を迎えた予約について、車両未登録なら車検証撮影を依頼する。既にこの予約に
 * 対する撮影フローがあれば (成功/失敗問わず) 再送しない。処理したら true。
 */
export async function promptVehicleCaptureIfNeeded(
  admin: Admin,
  tenantId: string,
  reservation: ReservationForCapture,
): Promise<boolean> {
  try {
    if (!reservation.customer_id) return false;
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoCaptureVehicleViaLine(settings)) return false;
    if (!(await tenantEligible(admin, tenantId))) return false;

    const existingFlows = await getFlowsByReservationId(admin, tenantId, reservation.id);
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
 */
export async function handleVehiclePhotoMessage(params: {
  tenantId: string;
  lineUserId: string;
  customerId?: string | null;
  imageBuffer: Buffer;
}): Promise<boolean> {
  const { tenantId, lineUserId, imageBuffer } = params;
  try {
    const admin = createServiceRoleAdmin("AI vehicle capture (photo) — no auth session");
    const flow = await getActiveFlow(admin, tenantId, { customerId: params.customerId, lineUserId });
    if (!flow || flow.state !== "awaiting_vehicle_photo") return false;
    if (!(await tenantEligible(admin, tenantId))) return false;

    // 顧客の送信をスレッドに残す (画像はどのみち通常経路で保存されないため)。
    await recordInboundLineMessage({
      tenantId,
      lineUserId,
      body: "[車検証の写真を送信]",
      rawEvent: { flow_photo: true },
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
      const { error } = await admin.from("reservations").update({ vehicle_id: vehicleId }).eq("id", reservationId);
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
      expectState: "awaiting_vehicle_photo",
    });

    const vehicleLabel = [parsed.maker, parsed.model].filter(Boolean).join(" ") || "お車";
    await sendCustomerLineText({
      tenantId,
      customerId: flow.customer_id,
      lineUserId,
      body: buildVehiclePhotoRegistered(vehicleLabel),
    });
    await notifyStaff(
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
    expectState: "awaiting_vehicle_photo",
  });
  await sendCustomerLineText({
    tenantId,
    customerId: flow.customer_id,
    lineUserId,
    body: buildVehiclePhotoFailedHandoff(),
  });
  await notifyStaff(
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
