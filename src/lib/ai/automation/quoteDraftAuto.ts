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
import { generateQuoteFromVehicle, extractInvoiceLines } from "@/lib/ai/quoteFromVehicle";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
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

    // 顧客名・登録車両・過去請求実績は互いに独立なので並列で取る。
    const [customerRes, vehiclesRes, invoicesRes] = await Promise.all([
      admin.from("customers").select("name").eq("id", customerId).eq("tenant_id", tenantId).maybeSingle(),
      admin
        .from("vehicles")
        .select("maker, model, size_class, plate_display")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .limit(5),
      admin
        .from("invoices")
        .select("items_json, total")
        .eq("tenant_id", tenantId)
        .order("issued_at", { ascending: false })
        .limit(20),
    ]);
    const customer = customerRes.data;

    // 登録車両とテキスト照合。マッチすればサイズ係数込みで精度が上がる。
    const haystack = vehicleText.toLowerCase();
    const matched = (vehiclesRes.data ?? []).find((v) =>
      [v.maker, v.model, v.plate_display]
        .filter((t): t is string => !!t && t.trim().length >= 2)
        .some((t) => haystack.includes(t.toLowerCase())),
    );
    const vehicle = matched
      ? { maker: matched.maker, model: matched.model, size_class: matched.size_class }
      : { maker: null, model: vehicleText, size_class: null };

    const pastInvoices = (invoicesRes.data ?? [])
      .map((r) => extractInvoiceLines(r.items_json, r.total as number | null))
      .filter((inv) => inv.items.length > 0)
      .slice(0, 5);

    const usage = startAiRouteUsage(ENDPOINT);
    const draft = await generateQuoteFromVehicle(
      {
        vehicle,
        customerName: customer?.name ?? null,
        serviceCategory: service,
        pastInvoices,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );
    // AI が使えない場合も決定的フォールバック (過去実績の頻出明細+平均単価) で
    // 起票を続行する — 手動の ai-from-vehicle と同じ扱い。明細ゼロのみ中止。
    if (draft.items.length === 0) {
      usage.record({ tenantId, outcome: draft.ai ? "ok" : "error", meta: { auto: true, committed: false } });
      return;
    }

    const itemsJson = draft.items.map((it) => ({
      item_type: "item",
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      amount: it.quantity * it.unit_price,
    }));
    const subtotal = itemsJson.reduce((sum, it) => sum + it.amount, 0);
    // ponytail: 税率 10% 固定・税抜モードのみ (documents ルートの calcItems 相当の
    // 簡易版)。軽減税率・税込入力・テナント別税率が必要になったら calcItems を
    // lib へ抽出して共用するのが upgrade path。ドラフトなので確定時に人が直せる。
    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;

    const note = [
      draft.ai
        ? "AI が LINE の問い合わせから自動起票しました（要確認・未送付）。"
        : "LINE の問い合わせから過去実績ベースで自動起票しました（AI 未使用・要確認・未送付）。",
      `問い合わせ内容: ${service} / ${vehicleText}`,
      matched ? "登録車両にマッチ" : "車両は本文からの読み取り (登録車両と未照合)",
      draft.terms ? `条件: ${draft.terms}` : null,
      `confidence: ${draft.confidence}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000);

    const docId = crypto.randomUUID();
    const { error } = await insertDocWithRetry(admin, tenantId, "estimate", "EST", (docNumber) =>
      admin.from("documents").insert({
        id: docId,
        tenant_id: tenantId,
        customer_id: customerId,
        recipient_name: customer?.name ?? null,
        doc_number: docNumber,
        doc_type: "estimate",
        issued_at: new Date().toISOString().slice(0, 10),
        status: "draft",
        subtotal,
        tax,
        total,
        tax_rate: 10,
        items_json: itemsJson,
        note,
        meta_json: {
          ai_inbound_draft: true,
          source_message_id: params.messageId,
          ai: draft.ai,
          confidence: draft.confidence,
          service_category: service,
          validity_days: draft.validity_days ?? null,
        },
      }),
    );
    if (error) {
      logger.warn("[quoteDraftAuto] estimate insert failed", { tenantId, err: error.message });
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return;
    }

    // スタッフ通知 (確認→確定してもらう導線)。chat_message とは別 type にして
    // 受信通知のクールダウンと干渉しない。通知失敗は起票を巻き戻さずログのみ。
    const { error: notifyErr } = await admin.from("notifications").insert({
      tenant_id: tenantId,
      user_id: null,
      notification_type: "ai_action",
      priority: "normal",
      title: "AI が見積ドラフトを起票しました",
      body: `${customer?.name ?? "顧客"} 様の問い合わせ（${service}）から見積下書きを作成しました。内容を確認して確定してください。`,
      link_path: `/admin/documents?doc_type=estimate`,
    });
    if (notifyErr) {
      logger.warn("[quoteDraftAuto] notification insert failed", { tenantId, err: notifyErr.message });
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "quote.auto_draft_from_inbound",
      resource: { kind: "document", id: docId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        confidence: draft.confidence,
        total,
      },
    });

    usage.record({
      tenantId,
      outcome: draft.ai ? "ok" : "error",
      confidence: draft.confidence,
      meta: { auto: true, committed: true, ai: draft.ai, items_count: draft.items.length, total },
    });
  } catch (e) {
    logger.warn("[quoteDraftAuto] maybeAutoDraftQuoteFromInbound threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
