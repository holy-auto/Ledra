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
 *   4. 条件を満たせば予約を自動起票 (decideInboundCommit)
 *   5. 未知顧客の場合、customer.auto_create が有効なら顧客を自動作成
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { extractInboundReservation } from "@/lib/ai/inboundReservationExtract";
import { fetchRecentConversation } from "@/lib/line/messageStore";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings } from "./policy";
import { maybeAutoDraftQuoteFromInbound } from "./quoteDraftAuto";
import { maybeAutoReplyRoughEstimate } from "./quoteReplyAuto";
import { maybeAutoReplyKnowledge } from "./knowledgeReplyAuto";
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
  /** LINE ユーザー ID。顧客自動作成時に line_user_id を紐付けるために使う。 */
  lineUserId?: string;
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

    // 複合認識: 同一スレッドの直近やり取りを文脈として渡し、会話全体から予約情報を統合抽出する。
    const history = await fetchRecentConversation(
      tenantId,
      { customerId, lineUserId: params.lineUserId },
      { currentMessageId: messageId },
    );

    const usage = startAiRouteUsage(AUTO_EXTRACT_ENDPOINT);
    const result = await extractInboundReservation(
      {
        text,
        channel: params.channel,
        receivedDate: params.receivedDate,
        history,
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

    // 予約の自動起票。
    // 決定の**前に** AI 抽出した連絡先 (email/phone) で既存顧客を解決する。特にメールは
    // 受信時に customer_id を付けないため、これが無いと (a) customer.auto_create を切った
    // 安全構成ではリピート顧客のメール予約が起票されず、(b) 重複顧客・同日重複予約ガードの
    // すり抜けが起きる。既知顧客として decideInboundCommit に渡す。
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && (result.email?.trim() || result.phone?.trim())) {
      const existingId = await resolveExistingCustomerByContact(admin, tenantId, {
        email: result.email,
        phone: result.phone,
      });
      if (existingId) {
        resolvedCustomerId = existingId;
        if (messageId) {
          await admin
            .from("customer_messages")
            .update({ customer_id: existingId })
            .eq("id", messageId)
            .eq("tenant_id", tenantId);
        }
      }
    }

    const decision = decideInboundCommit(settings, result, { knownCustomerId: resolvedCustomerId });
    let committedReservationId: string | null = null;

    if (decision.create && result.scheduled_date) {
      // 既存顧客に解決できず新規作成が必要な場合 (customer.auto_create=Pro のみ到達)。
      if (!resolvedCustomerId && decision.reason === "ok_with_new_customer") {
        // customer.auto_create requires Pro plan
        const planTier = normalizePlanTier(tenant.plan_tier);
        if (planTier !== "pro") {
          logger.info("[inboundAuto] customer auto-create requires Pro plan", { tenantId, planTier });
        } else {
          resolvedCustomerId = await autoCreateCustomer(admin, {
            tenantId,
            // 顧客名/連絡先は AI 抽出結果のみを使う (SMTP From は顧客本人とは限らないため)。
            name: result.customer_name?.trim() || "自動登録顧客",
            channel: params.channel,
            lineUserId: params.lineUserId,
            email: result.email?.trim() || undefined,
            // phone も保存しないと、後続メールを resolveExistingCustomerByContact で
            // 突き合わせられず重複顧客/重複予約になる。
            phone: result.phone?.trim() || undefined,
          });
          if (resolvedCustomerId && messageId) {
            await admin
              .from("customer_messages")
              .update({ customer_id: resolvedCustomerId })
              .eq("id", messageId)
              .eq("tenant_id", tenantId);
          }
          if (resolvedCustomerId) {
            // 人の確認なしで顧客を自動作成した事実を監査ログに残す。
            await logAutoActionExecuted({
              tenantId,
              actionKey: "customer.auto_create",
              resource: { kind: "customer", id: resolvedCustomerId },
              detail: { channel: params.channel ?? "line", source: "inbound_message" },
            });
          }
        }
        if (!resolvedCustomerId) {
          logger.warn("[inboundAuto] customer auto-create failed, skipping reservation", { tenantId });
        }
      }

      if (resolvedCustomerId) {
        committedReservationId = await autoCreateReservation(admin, {
          tenantId,
          customerId: resolvedCustomerId,
          scheduledDate: result.scheduled_date,
          service: result.service,
          vehicle: result.vehicle,
          dateText: result.date_text,
          note: result.note,
          confidence: result.confidence,
        });
        if (committedReservationId) {
          // 人の確認なしで予約を自動起票した事実を監査ログに残す。
          await logAutoActionExecuted({
            tenantId,
            actionKey: "inbound_message.auto_create_reservation",
            resource: { kind: "reservation", id: committedReservationId },
            detail: {
              channel: params.channel ?? "line",
              customer_id: resolvedCustomerId,
              commit_reason: decision.reason,
              confidence: typeof result.confidence === "number" ? result.confidence : null,
            },
          });
        }
      }
    }

    // 価格問い合わせ → 見積ドラフト自動起票 (opt-in / 既知顧客のみ / 内部で fail-soft)。
    await maybeAutoDraftQuoteFromInbound({
      tenantId,
      customerId: resolvedCustomerId,
      intent: result.intent,
      service: result.service,
      vehicleText: result.vehicle,
      messageId,
      channel: params.channel ?? "line",
      settings,
      tenant,
    });

    // 価格問い合わせ → 概算見積りを LINE で完全自動返信 (opt-in / 未紐付け客も対象 /
    // 内部で fail-soft)。上のドラフト起票とは独立した opt-in。詳細見積りは来店対応。
    const estimateReplied = await maybeAutoReplyRoughEstimate({
      tenantId,
      customerId: resolvedCustomerId,
      lineUserId: params.lineUserId,
      intent: result.intent,
      service: result.service,
      vehicleText: result.vehicle,
      text,
      messageId,
      channel: params.channel ?? "line",
      settings,
      tenant,
    });

    // 一般質問 → 店舗ナレッジで LINE 自動返信 (opt-in / 内部で fail-soft)。
    // 概算見積りが同じメッセージに返信済みなら二重返信になるためスキップ。
    if (!estimateReplied) {
      await maybeAutoReplyKnowledge({
        tenantId,
        customerId: resolvedCustomerId,
        lineUserId: params.lineUserId,
        intent: result.intent,
        text,
        messageId,
        channel: params.channel ?? "line",
        settings,
        tenant,
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
    // 複合認識の副作用対策: 履歴に前回の予約情報が残るため、「ありがとう」等の
    // フォローアップが同じ scheduled_date で再抽出され得る。同一顧客・同一日に
    // 未キャンセルの予約が既にあれば重複起票しない (P2: 二重予約防止)。
    const { data: dup } = await admin
      .from("reservations")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("scheduled_date", input.scheduledDate)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();
    if (dup?.id) {
      logger.info("[inboundAuto] skip duplicate auto reservation (same customer/date exists)", {
        tenantId: input.tenantId,
        existing: dup.id,
      });
      return null;
    }

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

    // 車両連携: フリーテキストから車両レコードを新規生成するのは誤登録リスクが
    // 高いため行わない。顧客に紐付く車両がちょうど 1 台で、かつ受信本文の車両
    // 記述がその車両 (メーカー/車種/ナンバー) と一致する場合のみ紐付ける。
    // (家族の別車両など、別車両の問い合わせを誤って紐付けないため。)
    let vehicleId: string | null = null;
    if (input.vehicle) {
      const { data: vehicles } = await admin
        .from("vehicles")
        .select("id, maker, model, plate_display")
        .eq("tenant_id", input.tenantId)
        .eq("customer_id", input.customerId)
        .limit(2);
      if (vehicles && vehicles.length === 1) {
        const v = vehicles[0] as {
          id: string;
          maker: string | null;
          model: string | null;
          plate_display: string | null;
        };
        const haystack = input.vehicle.toLowerCase();
        const tokens = [v.maker, v.model, v.plate_display]
          .filter((t): t is string => !!t && t.trim().length >= 2)
          .map((t) => t.toLowerCase());
        if (tokens.some((t) => haystack.includes(t))) {
          vehicleId = v.id;
        }
      }
    }

    const { error } = await admin.from("reservations").insert({
      id,
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      vehicle_id: vehicleId,
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

/** PostgREST の ilike パターンで特別扱いされる文字をエスケープする。 */
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/**
 * AI 抽出した連絡先 (email / phone) で既存顧客を1件解決する。重複顧客の作成を防ぐ。
 * email を優先し、無ければ phone。見つからなければ null。失敗時も null (投げない)。
 */
async function resolveExistingCustomerByContact(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
  contact: { email?: string; phone?: string },
): Promise<string | null> {
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  try {
    if (email) {
      const { data } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("email", escapeLike(email))
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
    if (phone) {
      const { data } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
  } catch (e) {
    logger.warn("[inboundAuto] resolveExistingCustomerByContact failed", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
  return null;
}

interface AutoCreateCustomerInput {
  tenantId: string;
  name: string;
  channel?: "line" | "email" | "form";
  lineUserId?: string;
  email?: string;
  phone?: string;
}

/** 顧客レコードを service-role で自動作成する。失敗時は null を返す (投げない)。 */
async function autoCreateCustomer(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  input: AutoCreateCustomerInput,
): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const row: Record<string, unknown> = {
      id,
      tenant_id: input.tenantId,
      name: input.name,
      source: `ai_auto_create_${input.channel ?? "unknown"}`,
    };
    if (input.lineUserId) {
      row.line_user_id = input.lineUserId;
    }
    if (input.email) {
      row.email = input.email;
    }
    if (input.phone) {
      row.phone = input.phone;
    }
    const { error } = await admin.from("customers").insert(row);
    if (error) {
      logger.warn("[inboundAuto] customer auto-create insert failed", {
        tenantId: input.tenantId,
        err: error.message,
      });
      return null;
    }
    logger.info("[inboundAuto] customer auto-created", { tenantId: input.tenantId, customerId: id });
    return id;
  } catch (e) {
    logger.warn("[inboundAuto] autoCreateCustomer threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
