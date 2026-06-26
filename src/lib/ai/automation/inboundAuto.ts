/**
 * 受信メッセージ (LINE 等) を、人の操作なしで AI 処理する IO 層。
 *
 * LINE webhook のイベント処理 (handleWebhookEvents) から **fire-and-forget** で
 * 呼ばれる。webhook は 200 を即返す必要があるため、ここは絶対に throw せず、
 * 失敗は logger に流して握りつぶす。
 *
 * 段階:
 *   1. テナント設定をロードし auto_extract が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+) と is_active を確認
 *   3. AI 抽出を実行し customer_messages.ai_extracted に保存 (= 受信箱に下書き)
 *   4. 条件を満たせば予約を自動起票 (decideInboundCommit / 壁3 遵守)
 *
 * 壁3:
 *   - 予約自動起票は「既知顧客」に限る (新規顧客=本人の自動作成はしない)
 *   - 金額は確定しない (estimated_amount=0)、タイトルに【要確認】を付与
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { extractInboundReservation } from "@/lib/ai/inboundReservationExtract";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoExtractInbound, decideInboundCommit } from "./orchestrator";

const AUTO_EXTRACT_ENDPOINT = "/api/line/webhook#auto-extract";

export interface MaybeAutoProcessParams {
  tenantId: string;
  /** customer_messages.id — ai_extracted の書き込み先。 */
  messageId: string | null;
  /** line_user_id から解決済みの既知顧客 ID (未知なら null)。 */
  customerId: string | null;
  text: string;
  channel?: "line" | "email" | "form";
  /** 相対日付の解釈に使う受信日 (YYYY-MM-DD)。 */
  receivedDate?: string;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 受信メッセージを自動抽出 (+ 条件次第で自動起票)。失敗しても投げない。
 */
export async function maybeAutoProcessInboundMessage(params: MaybeAutoProcessParams): Promise<void> {
  const { tenantId, messageId, customerId, text } = params;
  try {
    if (!text || !text.trim()) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoExtractInbound(settings)) return;

    // プラン / 有効性チェック (webhook には auth セッションが無いので DB から直接読む)。
    const admin = createServiceRoleAdmin("AI auto-extract inbound — LINE webhook lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract")) return;

    const usage = startAiRouteUsage(AUTO_EXTRACT_ENDPOINT);
    const result = await extractInboundReservation(
      {
        text,
        channel: params.channel,
        receivedDate: params.receivedDate,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    const snapshot = { ...result, auto: true, extracted_at: new Date().toISOString() };

    // 受信箱に下書きとして保存 (ai_extracted)。列未作成でも続行。
    if (messageId) {
      const { error: upErr } = await admin
        .from("customer_messages")
        .update({ ai_extracted: snapshot })
        .eq("id", messageId)
        .eq("tenant_id", tenantId);
      if (upErr && !isMissingColumnError(upErr)) {
        logger.warn("[inboundAuto] ai_extracted update failed", { tenantId, err: upErr.message });
      }
    }

    // 予約の自動起票 (壁3 遵守: 既知顧客 + 高確信 + 有効日 + new_reservation のみ)。
    const decision = decideInboundCommit(settings, result, { knownCustomerId: customerId });
    let committedReservationId: string | null = null;
    if (decision.create && result.scheduled_date) {
      committedReservationId = await autoCreateReservation(admin, {
        tenantId,
        customerId: customerId as string,
        scheduledDate: result.scheduled_date,
        service: result.service,
        vehicle: result.vehicle,
        dateText: result.date_text,
        note: result.note,
        confidence: result.confidence,
      });
    }

    usage.record({
      tenantId,
      outcome: result.ai ? "ok" : "error",
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      meta: {
        auto: true,
        intent: result.intent,
        channel: params.channel ?? "line",
        committed: committedReservationId != null,
        commit_reason: decision.reason,
      },
    });
  } catch (e) {
    logger.warn("[inboundAuto] maybeAutoProcessInboundMessage threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

interface AutoReservationInput {
  tenantId: string;
  customerId: string;
  scheduledDate: string;
  service?: string;
  vehicle?: string;
  dateText?: string;
  note?: string;
  confidence: number;
}

/** 予約を service-role で自動起票する。失敗時は null を返す (投げない)。 */
async function autoCreateReservation(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  input: AutoReservationInput,
): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const title = `【要確認】${(input.service || "AI受付予約").slice(0, 40)}`;
    const note = [
      "AI が受信メッセージから自動起票しました（要確認）。",
      input.dateText ? `希望日(原文): ${input.dateText}` : null,
      input.vehicle ? `車両: ${input.vehicle}` : null,
      input.note ? `メモ: ${input.note}` : null,
      `confidence: ${input.confidence}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000);

    const { error } = await admin.from("reservations").insert({
      id,
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      title,
      scheduled_date: input.scheduledDate,
      status: "confirmed",
      menu_items_json: [],
      estimated_amount: 0,
      note,
    });
    if (error) {
      logger.warn("[inboundAuto] auto reservation insert failed", {
        tenantId: input.tenantId,
        err: error.message,
      });
      return null;
    }
    return id;
  } catch (e) {
    logger.warn("[inboundAuto] autoCreateReservation threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
