/**
 * 受信メッセージ (車両+施工内容) から見積書 (documents doc_type=estimate) の
 * **draft** を起票する共有コア。
 *
 * 2 つの入口が再利用する:
 *   - quoteDraftAuto (quote.auto_draft_from_inbound): 価格問い合わせ受信で即起票
 *   - conversationFlowAuto (会話フロー): 詳細 (車種+年式) を受領した時点で起票
 *
 * 送付はしない (status=draft)。金額の確定・送付は人が行う (壁3)。
 * 明細ゼロ (材料皆無) や insert 失敗のときは null を返す。失敗しても投げない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { generateQuoteFromVehicle, extractInvoiceLines } from "@/lib/ai/quoteFromVehicle";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export interface CreateInboundQuoteDraftParams {
  tenantId: string;
  customerId: string;
  service: string;
  vehicleText: string;
  planTier: string | null;
  sourceMessageId: string | null;
  /** 起票元 (ログ・通知文面用)。 */
  origin: "inbound_inquiry" | "conversation_flow";
}

export interface InboundQuoteDraftResult {
  docId: string;
  total: number;
  ai: boolean;
  confidence: number;
}

/** 見積書 draft を起票する。失敗 (材料皆無 / insert エラー) 時は null。 */
export async function createInboundQuoteDraft(
  admin: Admin,
  params: CreateInboundQuoteDraftParams,
): Promise<InboundQuoteDraftResult | null> {
  const { tenantId, customerId, service, vehicleText } = params;

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
  const customer = customerRes.data as { name?: string | null } | null;

  // 登録車両とテキスト照合。マッチすればサイズ係数込みで精度が上がる。
  const haystack = vehicleText.toLowerCase();
  const matched = (
    (vehiclesRes.data as Array<{
      maker: string | null;
      model: string | null;
      size_class: string | null;
      plate_display: string | null;
    }> | null) ?? []
  ).find((v) =>
    [v.maker, v.model, v.plate_display]
      .filter((t): t is string => !!t && t.trim().length >= 2)
      .some((t) => haystack.includes(t.toLowerCase())),
  );
  const vehicle = matched
    ? { maker: matched.maker, model: matched.model, size_class: matched.size_class }
    : { maker: null, model: vehicleText, size_class: null };

  const pastInvoices = ((invoicesRes.data as Array<{ items_json: unknown; total: number | null }> | null) ?? [])
    .map((r) => extractInvoiceLines(r.items_json, r.total))
    .filter((inv) => inv.items.length > 0)
    .slice(0, 5);

  const draft = await generateQuoteFromVehicle(
    { vehicle, customerName: customer?.name ?? null, serviceCategory: service, pastInvoices },
    { model: fastModelForPlanTier(params.planTier) },
  );
  // AI 不可でも決定的フォールバックで続行。明細ゼロのみ中止。
  if (draft.items.length === 0) return null;

  const itemsJson = draft.items.map((it) => ({
    item_type: "item",
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    amount: it.quantity * it.unit_price,
  }));
  const subtotal = itemsJson.reduce((sum, it) => sum + it.amount, 0);
  // ponytail: 税率 10% 固定・税抜モードのみ。テナント別税率・軽減税率が要るなら
  // documents ルートの calcItems を lib へ抽出して共用する。ドラフトなので確定時に直せる。
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
        source: params.origin,
        source_message_id: params.sourceMessageId,
        ai: draft.ai,
        confidence: draft.confidence,
        service_category: service,
        validity_days: draft.validity_days ?? null,
      },
    }),
  );
  if (error) {
    logger.warn("[quoteDraftCore] estimate insert failed", { tenantId, err: error.message });
    return null;
  }

  // スタッフ通知 (確認→確定してもらう導線)。通知失敗は起票を巻き戻さずログのみ。
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
    logger.warn("[quoteDraftCore] notification insert failed", { tenantId, err: notifyErr.message });
  }

  return { docId, total, ai: draft.ai, confidence: draft.confidence };
}
