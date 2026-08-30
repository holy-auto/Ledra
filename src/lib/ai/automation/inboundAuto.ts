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
import { deterministicServiceVehicle } from "@/lib/ai/deterministicInboundParse";
import { fetchRecentConversation } from "@/lib/line/messageStore";
import { getActiveFlow } from "@/lib/line/flow/flowStore";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings } from "./policy";
import { maybeAutoDraftQuoteFromInbound } from "./quoteDraftAuto";
import { maybeAutoReplyRoughEstimate } from "./quoteReplyAuto";
import { maybeAutoReplyKnowledge } from "./knowledgeReplyAuto";
import { maybeStartQuoteFlow, maybeAdvanceQuoteFlowOnDetail } from "./conversationFlowAuto";
import { maybeStartCancelFlow } from "./cancelFlowAuto";
import { maybeStartRescheduleFlow } from "./rescheduleFlowAuto";
import { maybeReplyWorkStatus } from "./statusReplyAuto";
import {
  shouldAutoExtractInbound,
  shouldAutoReplyKnowledge,
  shouldAutoReplyRoughEstimate,
  shouldRunConversationFlow,
  shouldAutoSelfCancel,
  shouldAutoSelfReschedule,
  shouldAutoReplyStatus,
  decideInboundCommit,
} from "./orchestrator";
import { storeIdOrNull } from "@/lib/stores/resolveStoreId";

const AUTO_EXTRACT_ENDPOINT = "/api/line/webhook#auto-extract";

/**
 * 決定的車種フォールバックに渡す語彙を vehicle_size_master (全車種マスタ) から読む。
 * マスタに車種を足せば LINE の車種認識も自動で広がる (辞書の二重管理を避ける)。
 * 抽出漏れ時のみ (fallback パス) しか呼ばれないため都度 select で十分。失敗しても空で続行。
 * ponytail: マスタが数千件規模になり呼び出しが増えたら、TTL 付きのメモリキャッシュに載せる。
 */
async function loadVehicleMasterVocab(
  admin: ReturnType<typeof createServiceRoleAdmin>,
): Promise<{ extraMakers: string[]; extraModels: string[] }> {
  try {
    const { data } = await admin.from("vehicle_size_master").select("maker, model").limit(5000);
    const rows = (data as Array<{ maker: string | null; model: string | null }> | null) ?? [];
    const extraMakers = [...new Set(rows.map((r) => r.maker?.trim()).filter((v): v is string => !!v))];
    const extraModels = [...new Set(rows.map((r) => r.model?.trim()).filter((v): v is string => !!v))];
    return { extraMakers, extraModels };
  } catch {
    return { extraMakers: [], extraModels: [] };
  }
}

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
    // 抽出そのものの opt-in に加え、抽出結果 (intent 等) に依存する自動返信系の
    // opt-in だけが有効な場合も抽出は内部依存として実行する (結果の保存はしない)。
    // これが無いと「ナレッジ自動返信だけ ON」のテナントで機能が沈黙する。
    const wantExtract = shouldAutoExtractInbound(settings);
    const wantKnowledgeReply = shouldAutoReplyKnowledge(settings);
    const wantEstimateReply = shouldAutoReplyRoughEstimate(settings);
    // キャンセル/日程変更のセルフ対応も intent の抽出結果に依存するため、これ単独 opt-in でも抽出を走らせる。
    const wantSelfCancel = shouldAutoSelfCancel(settings);
    const wantSelfReschedule = shouldAutoSelfReschedule(settings);
    const wantStatusReply = shouldAutoReplyStatus(settings);
    if (
      !wantExtract &&
      !wantKnowledgeReply &&
      !wantEstimateReply &&
      !wantSelfCancel &&
      !wantSelfReschedule &&
      !wantStatusReply
    )
      return;

    // プラン / 有効性チェック (webhook には auth セッションが無いので DB から直接読む)。
    const admin = createServiceRoleAdmin("AI auto-extract inbound — LINE webhook lacks auth session");
    const { data: tenant } = await admin
      .from("tenants")
      .select("plan_tier, is_active, name")
      .eq("id", tenantId)
      .single();
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

    // AI 抽出は同形式のメッセージでも service/vehicle を埋めたり埋めなかったりと不安定な
    // ため、空だった項目だけを決定的キーワード辞書で補完する (AI が埋めた値は上書きしない)。
    // これが無いと抽出漏れのたびに概算見積り等の自動応答がすべて沈黙する。
    // 車種辞書は vehicle_size_master (全車種マスタ) の語彙も足して認識範囲を広げる
    // (固定辞書に無いアメ車等も、マスタに登録すれば認識できるようにする)。
    const detFallback = { service: false, vehicle: false };
    if (!result.service?.trim() || !result.vehicle?.trim()) {
      const det = deterministicServiceVehicle(text, await loadVehicleMasterVocab(admin));
      if (!result.service?.trim() && det.service) {
        result.service = det.service;
        detFallback.service = true;
      }
      if (!result.vehicle?.trim() && det.vehicle) {
        result.vehicle = det.vehicle;
        detFallback.vehicle = true;
      }
    }

    const snapshot = {
      ...result,
      auto: true,
      extracted_at: new Date().toISOString(),
      ...(detFallback.service || detFallback.vehicle ? { det_fallback: detFallback } : {}),
    };

    // 受信箱に下書きとして保存 (ai_extracted)。列未作成でも続行。
    // auto_extract が OFF (自動返信系のためだけに抽出した) 場合は保存しない。
    if (wantExtract && messageId) {
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

    // 会話フロー opt-in 済みなら、進行中フローの状態を一度だけ見て顧客向け自動処理を制御する。
    // 予約の自動起票より**前に**判定する: human_takeover (「スタッフに相談したい」ボタンが
    // 残す durable マーカー) の間は、予約自動起票を含む顧客向け自動処理をすべて止める
    // (相談希望なのに予約が自動確定されるのを防ぐ)。受信箱の下書き (ai_extracted) は上で
    // 保存済みなので、受動的な抽出は残しつつ能動的な起票・返信だけを止める。マーカーは
    // 72h で失効し自動応答は自然復帰する。
    //   - human_takeover … 以降を全てスキップして return。
    //   - その他の進行中フロー (見積り詳細待ち等) … 処理は続けるが誘導ボタンは付けない
    //     (start_quote は進行中フローがあると二重開始で無反応になるため)。
    //   - フロー無し … 誘導ボタンを添付する。
    let attachFollowupButtons = false;
    if (shouldRunConversationFlow(settings)) {
      const activeFlow = await getActiveFlow(admin, tenantId, {
        customerId: resolvedCustomerId,
        lineUserId: params.lineUserId,
      });
      if (activeFlow?.state === "human_takeover") {
        usage.record({
          tenantId,
          outcome: "ok",
          meta: { auto: true, suppressed: "human_takeover", channel: params.channel ?? "line" },
        });
        return;
      }
      attachFollowupButtons = !activeFlow;
    }

    // 予約キャンセルのセルフ対応 (opt-in / 内部で fail-soft)。intent=cancel なら本人の予約を
    // 提示して確認ボタンで即時キャンセルさせる。予約自動起票・他の自動返信より**前に**判定し、
    // 処理したら早期 return する (キャンセル希望に予約起票や見積り返信を重ねない)。
    if (wantSelfCancel && result.intent === "cancel") {
      const cancelStarted = await maybeStartCancelFlow({
        tenantId,
        customerId: resolvedCustomerId,
        lineUserId: params.lineUserId,
        intent: result.intent,
        messageId,
        channel: params.channel ?? "line",
        settings,
      });
      if (cancelStarted) {
        usage.record({
          tenantId,
          outcome: "ok",
          meta: { auto: true, self_cancel: true, channel: params.channel ?? "line" },
        });
        return;
      }
    }

    // 予約の日程変更のセルフ対応 (opt-in / 内部で fail-soft)。intent=change_reservation なら本人の
    // 予約を提示し、新しい日程候補ボタンで即時変更させる。キャンセルと同様、予約自動起票・他の
    // 自動返信より**前に**判定し、処理したら早期 return する。
    if (wantSelfReschedule && result.intent === "change_reservation") {
      const rescheduleStarted = await maybeStartRescheduleFlow({
        tenantId,
        customerId: resolvedCustomerId,
        lineUserId: params.lineUserId,
        intent: result.intent,
        messageId,
        channel: params.channel ?? "line",
        settings,
      });
      if (rescheduleStarted) {
        usage.record({
          tenantId,
          outcome: "ok",
          meta: { auto: true, self_reschedule: true, channel: params.channel ?? "line" },
        });
        return;
      }
    }

    // 予約・作業の状況問い合わせに自動返信 (opt-in / 内部で fail-soft)。intent=status_inquiry なら
    // 本人の直近予約の状況を返す。予約起票・他の自動返信より**前に**判定し、処理したら早期 return する。
    if (wantStatusReply && result.intent === "status_inquiry") {
      const statusReplied = await maybeReplyWorkStatus({
        tenantId,
        customerId: resolvedCustomerId,
        lineUserId: params.lineUserId,
        intent: result.intent,
        messageId,
        channel: params.channel ?? "line",
        settings,
      });
      if (statusReplied) {
        usage.record({
          tenantId,
          outcome: "ok",
          meta: { auto: true, status_reply: true, channel: params.channel ?? "line" },
        });
        return;
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

    // 進行中の会話フローが「詳細待ち (awaiting_quote_detail)」なら、今回の受信を
    // その詳細 (車種+年式) として取り込み、正式見積書の下書きを作成してフローを
    // 進める (opt-in / 内部で fail-soft)。**他の自動処理より先に**判定し、処理したら
    // 早期 return する — 見積ドラフト自動起票 (下) と二重に下書きを作らず、概算・
    // ナレッジ返信も重ねて送らないため。
    const flowAdvanced = await maybeAdvanceQuoteFlowOnDetail({
      tenantId,
      customerId: resolvedCustomerId,
      lineUserId: params.lineUserId,
      service: result.service,
      vehicleText: result.vehicle,
      messageId,
      channel: params.channel ?? "line",
      settings,
      tenant,
    });
    if (flowAdvanced) {
      usage.record({
        tenantId,
        outcome: "ok",
        confidence: typeof result.confidence === "number" ? result.confidence : null,
        meta: { auto: true, flow: "quote_detail_advanced", channel: params.channel ?? "line" },
      });
      return;
    }

    // 一般質問 → 店舗/共通ナレッジで LINE 自動返信 (opt-in / 内部で fail-soft)。
    // 概算見積りより**先に**試す: 「駐車場の料金は？」のような価格キーワードを含む
    // 一般質問を、見積りの「不足情報聞き返し」が誤って先取りしないため。ナレッジで
    // 回答できない場合 (can_answer=false) は何も送らず false が返り、見積りに進む。
    // ponytail: 二重返信ガードは返り値 boolean の手配線。自動返信系が 3 つ以上に
    // 増えたら、customer_messages の元メッセージ単位で送信をデデュープする共有層
    // (sendCustomerLineText のラッパー) に置き換える。
    const knowledgeReplied = await maybeAutoReplyKnowledge({
      tenantId,
      customerId: resolvedCustomerId,
      lineUserId: params.lineUserId,
      intent: result.intent,
      text,
      messageId,
      channel: params.channel ?? "line",
      settings,
      tenant,
      history,
      attachButtons: attachFollowupButtons,
    });

    // 価格問い合わせ → 概算見積りを LINE で完全自動返信 (opt-in / 未紐付け客も対象 /
    // 内部で fail-soft)。末尾の見積ドラフト起票とは独立した opt-in。詳細見積りは来店対応。
    // ナレッジが同じメッセージに返信済みなら二重返信になるためスキップ。
    let estimateReplied = false;
    if (!knowledgeReplied) {
      estimateReplied = await maybeAutoReplyRoughEstimate({
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
        // 概算の直後に「正式なお見積り / スタッフ相談」誘導ボタンを添えるか (ナレッジ返信と同条件)。
        attachButtons: attachFollowupButtons,
      });
    }

    // 価格問い合わせ → 会話フローを開始し「概算だけで終わらせず」正式見積りへ続ける
    // (opt-in / 内部で fail-soft)。概算見積り・ナレッジ返信とは独立した opt-in。
    // 詳細 (車検証/車種+年式) を尋ね、スレッドを状態機械に記録する (Phase 1a)。
    // 同一メッセージに概算/ナレッジで返信済みなら矛盾・二重を避けて見送る。
    await maybeStartQuoteFlow({
      tenantId,
      customerId: resolvedCustomerId,
      lineUserId: params.lineUserId,
      intent: result.intent,
      service: result.service,
      vehicleText: result.vehicle,
      messageId,
      channel: params.channel ?? "line",
      alreadyReplied: knowledgeReplied || estimateReplied,
      settings,
      tenant,
    });

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

    // 価格問い合わせ → 見積ドラフト自動起票 (opt-in / 既知顧客のみ / 内部で fail-soft)。
    // これは顧客に届かないスタッフ用の下書き。**顧客向け返信 (ナレッジ/概算/会話フロー) の
    // 後に**実行する: LINE webhook は after() 内で全 AI チェーンを maxDuration 内に収める
    // 必要があり、抽出が遅い回だと連鎖が制限時間を超えて最後発の処理が打ち切られる。
    // 打ち切られてよいのは顧客影響の無いこの内部ドラフト側であって、顧客への概算返信では
    // ないため、優先度の低いこれを最後に回す。
    // ponytail: 恒久策は「抽出→顧客返信」を最優先チェーンに分離し、内部ドラフト等を別 after()
    // (別関数実行) に切り出して独立予算で走らせること。まずは順序で最悪ケースを回避する。
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
      store_id: await storeIdOrNull(admin, input.tenantId, "inboundAuto"),
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
      // customers の実列は source_system（source は存在しない）
      source_system: `ai_auto_create_${input.channel ?? "unknown"}`,
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
