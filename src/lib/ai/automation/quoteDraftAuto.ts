/**
 * 受信メッセージ (価格問い合わせ) → 見積ドラフト自動起票の IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。
 * 「ヴェルファイアのコーティングいくら？」のような施工内容+車両が読み取れた
 * メッセージに対して、過去の請求実績を基に見積書 (documents doc_type=estimate)
 * の **draft** を起票する。送付は行わない — 人が draft→sent に確定した時点で
 * documentAuto (quote.auto_send_on_confirm) が LINE/メール送付を担う。
 *
 * 安全ガード:
 *   - opt-in (quote.auto_draft_from_inbound, 既定 OFF) + Standard プラン以上
 *   - 既知顧客のみ (見知らぬ LINE ユーザーには起票しない)
 *   - intent が inquiry_only / new_reservation で施工内容と車両の両方が抽出できた場合のみ
 *   - 同一顧客への AI 起票ドラフトが 24h 以内にあれば重複起票しない
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { generateQuoteFromVehicle } from "@/lib/ai/quoteFromVehicle";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings } from "./policy";
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

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoDraftQuoteFromInbound(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-draft quote from inbound — LINE webhook lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return;

    // 重複起票ガード: 直近 24h に同一顧客への AI 起票ドラフトがあればスキップ。
    const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3600_000).toISOString();
    const { count: recentCount } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .eq("doc_type", "estimate")
      .eq("status", "draft")
      .gte("created_at", sinceIso)
      .contains("meta_json", { ai_inbound_draft: true });
    if ((recentCount ?? 0) > 0) return;

    // 顧客名と車両。顧客の登録車両にマッチすればサイズ係数込みで精度が上がる。
    const { data: customer } = await admin
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const { data: vehicles } = await admin
      .from("vehicles")
      .select("maker, model, size_class, plate_display")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .limit(5);
    const haystack = vehicleText.toLowerCase();
    const matched = (vehicles ?? []).find((v) =>
      [v.maker, v.model, v.plate_display]
        .filter((t): t is string => !!t && t.trim().length >= 2)
        .some((t) => haystack.includes(t.toLowerCase())),
    );
    const vehicle = matched
      ? { maker: matched.maker, model: matched.model, size_class: matched.size_class }
      : { maker: null, model: vehicleText, size_class: null };

    // 同テナント直近の請求実績 (価格バンドの根拠)。
    const { data: invoiceRows } = await admin
      .from("invoices")
      .select("items_json, total")
      .eq("tenant_id", tenantId)
      .order("issued_at", { ascending: false })
      .limit(20);
    const pastInvoices = (invoiceRows ?? [])
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
    if (!draft.ai || draft.items.length === 0) {
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
    const tax = Math.floor(subtotal * 0.1);

    const note = [
      "AI が LINE の問い合わせから自動起票しました（要確認・未送付）。",
      `問い合わせ内容: ${service} / ${vehicleText}`,
      matched ? "登録車両にマッチ" : "車両は本文からの読み取り (登録車両と未照合)",
      `confidence: ${draft.confidence}`,
    ]
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
        total: subtotal + tax,
        tax_rate: 10,
        items_json: itemsJson,
        note,
        meta_json: {
          ai_inbound_draft: true,
          source_message_id: params.messageId,
          ai: true,
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
    // 受信通知のクールダウンと干渉しない。
    await admin.from("notifications").insert({
      tenant_id: tenantId,
      user_id: null,
      notification_type: "ai_action",
      priority: "normal",
      title: "AI が見積ドラフトを起票しました",
      body: `${customer?.name ?? "顧客"} 様の問い合わせ（${service}）から見積下書きを作成しました。内容を確認して確定してください。`,
      link_path: `/admin/documents?doc_type=estimate`,
    });

    await logAutoActionExecuted({
      tenantId,
      actionKey: "quote.auto_draft_from_inbound",
      resource: { kind: "document", id: docId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        confidence: draft.confidence,
        total: subtotal + tax,
      },
    });

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: draft.confidence,
      meta: { auto: true, committed: true, items_count: draft.items.length, total: subtotal + tax },
    });
  } catch (e) {
    logger.warn("[quoteDraftAuto] maybeAutoDraftQuoteFromInbound threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** invoices.items_json から明細行を取り出す (quotes/ai-from-vehicle と同じ寛容パース)。 */
function extractInvoiceLines(
  rawItems: unknown,
  total: number | null,
): { items: Array<{ description: string; unit_price: number; quantity: number }>; total: number } {
  const lines: Array<{ description: string; unit_price: number; quantity: number }> = [];
  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      const it = raw as { description?: unknown; unit_price?: unknown; quantity?: unknown; item_type?: unknown };
      if (it.item_type && it.item_type !== "item") continue;
      const description = typeof it.description === "string" ? it.description.trim() : "";
      const unitPrice = typeof it.unit_price === "number" ? it.unit_price : NaN;
      const quantity = typeof it.quantity === "number" ? it.quantity : 1;
      if (description && Number.isFinite(unitPrice) && unitPrice >= 0) {
        lines.push({ description, unit_price: unitPrice, quantity });
      }
    }
  }
  return { items: lines, total: typeof total === "number" ? total : 0 };
}
