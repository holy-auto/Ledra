/**
 * 受信メッセージ (価格問い合わせ) → 概算見積りを LINE で完全自動返信する IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。
 * 「ヴェルファイアのコーティングいくら？」のような施工内容+車両が読み取れた
 * メッセージに対して、過去の請求実績を基に **概算金額をレンジ (〜幅) で**
 * 顧客の LINE へ即返信する。人の確認は挟まない (opt-in・既定 OFF)。
 *
 * quoteDraftAuto (見積ドラフトを起票してスタッフが確定→送付) とは別系統:
 *   - こちらは「概算・要来店」の但し書き付きレンジのみを返す (外向き確定ではない)
 *   - 正式・詳細な見積りは案内文で来店に誘導する (詳細見積りは来店対応)
 *   - 未紐付けの新規客にも返信する (customerId が null でも可)
 *
 * AI が使えない場合 (API キー未設定・タイムアウト等) も、過去実績ベースの
 * 決定的フォールバック概算で返信を続行する。概算の材料が皆無 (総額 0) の
 * ときだけ、金額を出さず来店案内文を返す。
 *
 * 安全ガード:
 *   - opt-in (quote.auto_reply_rough_estimate, 既定 OFF) + Standard プラン以上
 *   - LINE 受信 (lineUserId あり) のみ — push で返信する
 *   - intent が inquiry_only / new_reservation で施工内容と車両の両方が抽出できた場合のみ
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { generateQuoteFromVehicle, extractInvoiceLines } from "@/lib/ai/quoteFromVehicle";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { sendCustomerLineText } from "@/lib/line/client";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldAutoReplyRoughEstimate } from "./orchestrator";

const ENDPOINT = "/api/line/webhook#auto-quote-reply";
const TAX_RATE = 0.1;

export interface MaybeAutoReplyRoughEstimateParams {
  tenantId: string;
  /** 既知顧客 ID。null (未紐付けの新規客) でも返信する。 */
  customerId: string | null;
  /** 返信先 LINE ユーザー ID。無ければ push できないので何もしない。 */
  lineUserId?: string | null;
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

/**
 * 税込総額 ±15% を ¥1,000 単位に丸めた概算レンジ。
 * 概算であることを示す「幅」を持たせ、来店時の詳細見積りとの差分クレームを避ける。
 */
export function roughEstimateRange(totalInclTax: number): { low: number; high: number } {
  const low = Math.max(0, Math.floor((totalInclTax * 0.85) / 1000) * 1000);
  const high = Math.ceil((totalInclTax * 1.15) / 1000) * 1000;
  return { low, high };
}

/** 概算レンジ / 来店案内の返信本文を組み立てる。total<=0 なら金額なしで来店案内。 */
export function buildRoughEstimateMessage(input: {
  service: string;
  vehicleText: string;
  totalInclTax: number;
}): string {
  const head = ["◯ 内容: " + input.service, "◯ お車: " + input.vehicleText];
  if (input.totalInclTax > 0) {
    const { low, high } = roughEstimateRange(input.totalInclTax);
    return [
      "【概算お見積り】",
      ...head,
      `◯ 概算金額: ¥${low.toLocaleString("ja-JP")}〜¥${high.toLocaleString("ja-JP")}（税込）`,
      "",
      "※上記は過去実績に基づく概算です。お車の状態により変動します。",
      "※正式・詳細なお見積りはご来店時に承ります。ご予約お待ちしております。",
    ].join("\n");
  }
  return [
    "【お見積りについて】",
    ...head,
    "",
    "お見積りはお車を拝見してのご案内になります。",
    "正式なお見積り・詳細はご来店時に承ります。ご予約お待ちしております。",
  ].join("\n");
}

/** 受信メッセージに概算見積りを LINE で自動返信する。失敗しても投げない。 */
export async function maybeAutoReplyRoughEstimate(params: MaybeAutoReplyRoughEstimateParams): Promise<void> {
  const { tenantId, customerId } = params;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return; // push 返信先が無い (LINE 以外) なら何もしない
    const service = params.service?.trim();
    const vehicleText = params.vehicleText?.trim();
    if (!service || !vehicleText) return;
    if (params.intent !== "inquiry_only" && params.intent !== "new_reservation") return;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoReplyRoughEstimate(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-reply rough estimate — LINE webhook lacks auth session");
    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return;

    // 顧客名・登録車両は既知顧客のときだけ引く。未紐付けの新規客は車両テキストと
    // テナント全体の過去請求実績だけで概算する (精度は落ちるが返信はできる)。
    const [customerRes, vehiclesRes, invoicesRes] = await Promise.all([
      customerId
        ? admin.from("customers").select("name").eq("id", customerId).eq("tenant_id", tenantId).maybeSingle()
        : Promise.resolve({ data: null }),
      customerId
        ? admin
            .from("vehicles")
            .select("maker, model, size_class, plate_display")
            .eq("tenant_id", tenantId)
            .eq("customer_id", customerId)
            .limit(5)
        : Promise.resolve({ data: [] }),
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

    const usage = startAiRouteUsage(ENDPOINT);
    const quote = await generateQuoteFromVehicle(
      {
        vehicle,
        customerName: customer?.name ?? null,
        serviceCategory: service,
        pastInvoices,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    // 概算の材料が皆無 (総額 0) なら金額を出さず来店案内を返す。それ以外は概算レンジを返す。
    const totalInclTax = Math.round(quote.total * (1 + TAX_RATE));
    const body = buildRoughEstimateMessage({ service, vehicleText, totalInclTax });

    const delivered = await sendCustomerLineText({
      tenantId,
      customerId: customerId ?? null,
      lineUserId,
      body,
    });
    if (!delivered) {
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return;
    }

    await logAutoActionExecuted({
      tenantId,
      actionKey: "quote.auto_reply_rough_estimate",
      resource: { kind: "line_user", id: lineUserId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        confidence: quote.confidence,
        total_incl_tax: totalInclTax,
        has_amount: totalInclTax > 0,
      },
    });

    usage.record({
      tenantId,
      outcome: quote.ai ? "ok" : "error",
      confidence: quote.confidence,
      meta: { auto: true, committed: true, ai: quote.ai, total_incl_tax: totalInclTax },
    });
  } catch (e) {
    logger.warn("[quoteReplyAuto] maybeAutoReplyRoughEstimate threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
