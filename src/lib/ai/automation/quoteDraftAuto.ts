/**
 * 受信メッセージ (価格問い合わせ) → 見積ドラフト自動起票の IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。
 * 「ヴェルファイアのコーティングいくら？」のような施工内容+車両が読み取れた
 * メッセージに対して、過去の請求実績を基に見積書 (documents doc_type=estimate)
 * の **draft** を起票する。送付は行わない — 人が draft→sent に確定した時点で
 * documentAuto (quote.auto_send_on_confirm) が LINE/メール送付を担う。
 *
 * AI が使えない場合 (API キー未設定・タイムアウト等) も、過去実績ベースの
 * 決定的フォールバック見積で起票を続行する (手動の ai-from-vehicle と同挙動)。
 *
 * 安全ガード:
 *   - opt-in (quote.auto_draft_from_inbound, 既定 OFF) + Standard プラン以上
 *   - 既知顧客のみ (見知らぬ LINE ユーザーには起票しない)
 *   - intent が inquiry_only / new_reservation で施工内容と車両の両方が抽出できた場合のみ
 *   - 同一顧客への AI 起票見積が 24h 以内にあれば重複起票しない
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { createInboundQuoteDraft } from "./quoteDraftCore";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldAutoDraftQuoteFromInbound } from "./orchestrator";

const ENDPOINT = "/api/line/webhook#auto-quote-draft";
const DEDUP_HOURS = 24;

export interface MaybeAutoDraftQuoteParams {
  tenantId: string;
  /** 既知顧客のみ対象。null なら何もしない。 */
  customerId: string | null;
  /** AI 抽出結果 (extractInboundReservation)。 */
  intent: string;
  service?: string;
  vehicleText?: string;
  /** 起票元の customer_messages.id (トレーサビリティ用)。 */
  messageId: string | null;
  channel?: string;
  /** 呼び出し元 (inboundAuto) が既にロード済みなら渡して二重読込を避ける。 */
  settings?: AiAutomationSettings;
  tenant?: { plan_tier: string | null; is_active: boolean | null };
}

/** 受信メッセージから見積ドラフトを自動起票する。失敗しても投げない。 */
export async function maybeAutoDraftQuoteFromInbound(params: MaybeAutoDraftQuoteParams): Promise<void> {
  const { tenantId, customerId } = params;
  try {
    if (!customerId) return;
    const service = params.service?.trim();
    const vehicleText = params.vehicleText?.trim();
    if (!service || !vehicleText) return;
    if (params.intent !== "inquiry_only" && params.intent !== "new_reservation") return;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoDraftQuoteFromInbound(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-draft quote from inbound — LINE webhook lacks auth session");
    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return;

    // 重複起票ガード: 直近 24h に同一顧客への AI 起票見積 (status 問わず) があればスキップ。
    // ponytail: SELECT→INSERT の非原子ガード。LINE 再配信は webhook 側の
    // webhookEventId 冪等化で吸収済みで、残る競合は「同一顧客が数秒以内に
    // 2 通送る」場合のみ。実害はドラフトが 2 枚できる (送付はされない) に
    // 留まるため、原子化 (部分ユニーク索引) はドラフト乱造が実際に観測されたら。
    const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3600_000).toISOString();
    const { data: recentDrafts } = await admin
      .from("documents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .eq("doc_type", "estimate")
      .gte("created_at", sinceIso)
      .contains("meta_json", { ai_inbound_draft: true })
      .limit(1);
    if ((recentDrafts ?? []).length > 0) return;

    const usage = startAiRouteUsage(ENDPOINT);
    const draft = await createInboundQuoteDraft(admin, {
      tenantId,
      customerId,
      service,
      vehicleText,
      planTier: tenant.plan_tier,
      sourceMessageId: params.messageId,
      origin: "inbound_inquiry",
    });
    // 材料皆無 (明細ゼロ) or insert 失敗のときは null。
    if (!draft) {
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "quote.auto_draft_from_inbound",
      resource: { kind: "document", id: draft.docId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        confidence: draft.confidence,
        total: draft.total,
      },
    });

    usage.record({
      tenantId,
      outcome: draft.ai ? "ok" : "error",
      confidence: draft.confidence,
      meta: { auto: true, committed: true, ai: draft.ai, total: draft.total },
    });
  } catch (e) {
    logger.warn("[quoteDraftAuto] maybeAutoDraftQuoteFromInbound threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
