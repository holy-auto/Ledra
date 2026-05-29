/**
 * 車両 + 顧客 → 見積書 (estimate) AI 起票。
 *
 * 過去の類似請求書 / 同テナントの単価実績 / 車両サイズから「想定明細」を
 * 組み立て、Haiku に「妥当な価格バンド」をチェックさせる。
 *
 * 出力はそのまま `documents` (doc_type="estimate") として save できる形。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface PastInvoiceLine {
  description: string;
  unit_price: number;
  quantity: number;
}

export interface QuoteFromVehicleInput {
  vehicle: { maker?: string | null; model?: string | null; size_class?: string | null };
  customerName?: string | null;
  serviceCategory: string;
  /** 同テナント / 同カテゴリの直近請求書 1〜5 件 */
  pastInvoices: Array<{ items: PastInvoiceLine[]; total: number }>;
  /** 任意で店舗が指定したいベースメニュー (これに価格を貼る) */
  baseMenu?: Array<{ name: string; default_price?: number | null }>;
}

const QuoteSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().int().min(1),
        unit_price: z.number().int().min(0),
        rationale: z.string().max(120).optional(),
      }),
    )
    .max(20),
  total: z.number().int().min(0),
  validity_days: z.number().int().min(7).max(180),
  terms: z.string().max(400),
  confidence: z.number().min(0).max(1),
});

export interface QuoteFromVehicleResult {
  items: Array<{ description: string; quantity: number; unit_price: number; rationale?: string }>;
  total: number;
  validity_days: number;
  terms: string;
  confidence: number;
  ai: boolean;
}

export function buildDeterministicQuote(input: QuoteFromVehicleInput): QuoteFromVehicleResult {
  const items: QuoteFromVehicleResult["items"] = [];
  // 同カテゴリ過去請求書の中央値を採用 (外れ値耐性)
  if (input.baseMenu && input.baseMenu.length > 0) {
    for (const m of input.baseMenu) {
      const price =
        m.default_price && m.default_price > 0
          ? Math.round(m.default_price)
          : medianUnitPriceFor(input.pastInvoices, m.name) ?? 0;
      items.push({ description: m.name, quantity: 1, unit_price: price });
    }
  } else if (input.pastInvoices.length > 0) {
    // 最頻出の明細を上位 3 件
    const tally = new Map<string, { totalPrice: number; count: number }>();
    for (const inv of input.pastInvoices) {
      for (const line of inv.items) {
        const cur = tally.get(line.description) ?? { totalPrice: 0, count: 0 };
        cur.totalPrice += line.unit_price;
        cur.count += 1;
        tally.set(line.description, cur);
      }
    }
    const sorted = [...tally.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3);
    for (const [desc, agg] of sorted) {
      items.push({ description: desc, quantity: 1, unit_price: Math.round(agg.totalPrice / agg.count) });
    }
  } else {
    items.push({ description: `${input.serviceCategory} 一式`, quantity: 1, unit_price: 0 });
  }

  // 車両サイズ係数: SS<S<M<L<LL<XL で +0/+5/+10/+15/+20/+25 % の単純倍率
  const sizeUplift = sizeMultiplier(input.vehicle.size_class);
  if (sizeUplift !== 1) {
    for (const item of items) item.unit_price = Math.round(item.unit_price * sizeUplift);
  }

  const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  return {
    items,
    total,
    validity_days: 30,
    terms: "本見積もりの有効期限は発行から 30 日とさせていただきます。施工内容により金額が変動する場合があります。",
    confidence: items.some((i) => i.unit_price > 0) ? 0.5 : 0.2,
    ai: false,
  };
}

export async function generateQuoteFromVehicle(input: QuoteFromVehicleInput): Promise<QuoteFromVehicleResult> {
  const baseline = buildDeterministicQuote(input);
  if (!process.env.ANTHROPIC_API_KEY) return baseline;

  const client = getAnthropicClient();
  const facts: string[] = [
    `カテゴリ: ${input.serviceCategory}`,
    `車両: ${[input.vehicle.maker, input.vehicle.model, input.vehicle.size_class].filter(Boolean).join(" ")}`,
  ];
  if (input.customerName) facts.push(`顧客: ${input.customerName}`);
  if (input.pastInvoices.length > 0) {
    facts.push(
      `過去類似請求書 (合計 ¥${avgTotal(input.pastInvoices).toLocaleString("ja-JP")} 前後)\n` +
        input.pastInvoices
          .slice(0, 3)
          .map((inv, i) => `  事例${i + 1}: ${inv.items.map((l) => `${l.description} ¥${l.unit_price}`).join(" / ")}`)
          .join("\n"),
    );
  }
  facts.push(
    `現時点の deterministic な下書き: ${baseline.items
      .map((i) => `${i.description} ¥${i.unit_price}`)
      .join(" / ")} (合計 ¥${baseline.total})`,
  );

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(QuoteSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed || parsed.items.length === 0) return baseline;
    return {
      items: parsed.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        rationale: i.rationale,
      })),
      total: parsed.total,
      validity_days: parsed.validity_days,
      terms: parsed.terms || baseline.terms,
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[quoteFromVehicle] generation failed:", err);
    return baseline;
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店の見積もり作成を支援するアシスタントです。
車両情報・カテゴリ・過去類似請求書から、見積書の明細・合計・有効期限・条件文を出してください。

ルール:
- 過去事例からかけ離れた価格は提示しない。中央値の ±30% 以内に収める
- 単価は税抜き整数円
- 明細は 5 行以内 (材料を含めるなら "下地処理" "コーティング剤" "施工技術料" のような区切り)
- rationale は 1 行 (なぜその価格か。"同車種同施工の中央値" 等)
- terms は 1〜2 文。値引き / 振込先 / キャンセル料の文言は店舗が後付けするので最低限にとどめる

confidence: 0.0〜1.0 で自己評価 (事例件数が少ない場合は低めに)。`.trim();

function medianUnitPriceFor(invoices: QuoteFromVehicleInput["pastInvoices"], description: string): number | null {
  const prices = invoices.flatMap((inv) => inv.items.filter((l) => l.description === description).map((l) => l.unit_price));
  if (prices.length === 0) return null;
  prices.sort((a, b) => a - b);
  return Math.round(prices[Math.floor(prices.length / 2)]);
}

function avgTotal(invoices: QuoteFromVehicleInput["pastInvoices"]): number {
  if (invoices.length === 0) return 0;
  return Math.round(invoices.reduce((s, i) => s + i.total, 0) / invoices.length);
}

function sizeMultiplier(size: string | null | undefined): number {
  switch ((size ?? "").toUpperCase()) {
    case "SS":
      return 1;
    case "S":
      return 1.05;
    case "M":
      return 1.1;
    case "L":
      return 1.15;
    case "LL":
      return 1.2;
    case "XL":
      return 1.25;
    default:
      return 1;
  }
}
