/**
 * 高精度版の見積もり生成。
 *
 * 既存の `quoteFromVehicle` をベースに、`pricingIntelligence` が抽出した
 * テナント実勢価格 (中央値 / P25–P75 / 成約率) を AI への context として注入し、
 * 「過去の成約実績に沿った競争力のある価格」を提案させる。
 *
 * - 精度を優先するため Haiku ではなく Sonnet (AI_MODEL) を使う。
 * - pricingContext が空、または AI 失敗時は基本版 `generateQuoteFromVehicle` に
 *   フォールバックする (fail-open)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import {
  generateQuoteFromVehicle,
  buildDeterministicQuote,
  type QuoteFromVehicleInput,
  type QuoteFromVehicleResult,
} from "@/lib/ai/quoteFromVehicle";
import type { PricingContext, PricingPattern } from "@/lib/ai/pricingIntelligence";

export interface EnhancedQuoteInput extends QuoteFromVehicleInput {
  /** buildPricingContext から注入する実勢価格 context */
  pricingContext: PricingContext;
  /** 顧客が希望するサービス名の配列 */
  requestedServices: string[];
}

export interface EnhancedQuoteResult extends QuoteFromVehicleResult {
  /** プロンプトに反映した実勢価格パターンの件数 */
  patterns_used: number;
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

/** 大文字小文字を無視した部分一致 (どちらかが他方を含めばマッチ)。 */
function fuzzyContains(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * requestedService に最も近い PricingPattern を選ぶ。
 *
 * 優先順位:
 *  1. 車両メーカー一致 (input.vehicle.maker) かつ service_name fuzzy 一致
 *  2. メーカー横断 (maker 無し) かつ service_name fuzzy 一致
 * 同条件内では sample_count が大きいものを採用。
 */
export function matchPattern(
  patterns: PricingPattern[],
  requestedService: string,
  maker?: string | null,
): PricingPattern | null {
  const candidates = patterns.filter((p) => fuzzyContains(p.service_name, requestedService));
  if (candidates.length === 0) return null;

  const makerNorm = (maker ?? "").trim().toLowerCase();
  const scored = candidates
    .map((p) => {
      const makerMatch = makerNorm && p.maker ? p.maker.trim().toLowerCase() === makerNorm : false;
      const genericFallback = !p.maker;
      // メーカー一致 > メーカー横断フォールバック > メーカー不一致
      const tier = makerMatch ? 2 : genericFallback ? 1 : 0;
      return { p, tier };
    })
    .sort((a, b) => b.tier - a.tier || b.p.sample_count - a.p.sample_count);

  return scored[0]?.p ?? null;
}

function jpy(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

/**
 * マッチしたパターン群を AI プロンプト用の「過去成約実績」テキストにする。
 */
function buildMarketPricingSection(matches: Array<{ service: string; pattern: PricingPattern }>): string {
  const lines = matches.map(({ service, pattern }) => {
    const base =
      `過去の成約実績: ${service}: 中央値 ${jpy(pattern.median_price)} ` +
      `(P25: ${jpy(pattern.p25_price)} – P75: ${jpy(pattern.p75_price)}) / ${pattern.sample_count}件`;
    const rate =
      pattern.acceptance_rate !== undefined ? ` [成約率 ${(pattern.acceptance_rate * 100).toFixed(0)}%]` : "";
    const makerNote = pattern.maker ? ` (${pattern.maker})` : "";
    return `- ${base}${rate}${makerNote}`;
  });
  return lines.join("\n");
}

const ENHANCED_SYSTEM_PROMPT = `あなたは自動車施工店の見積もり作成を支援するアシスタントです。
車両情報・カテゴリ・過去類似請求書、そして「過去成約実績 (実勢価格)」から、見積書の明細・合計・有効期限・条件文を出してください。

以下の過去成約実績を参考にして、競争力のある価格を提案してください。
- 提示価格は原則として各サービスの P25〜P75 のレンジ内に収める。逸脱する場合は rationale に理由を書く。
- 成約率が低いサービスは中央値〜P25 寄りに設定し、受注確度を高める。

ルール:
- 過去事例からかけ離れた価格は提示しない (中央値の ±30% 以内を目安)
- 単価は税抜き整数円
- 明細は要望サービスを中心に 6 行以内
- rationale は 1 行 (なぜその価格か。"同車種同施工の中央値" 等)
- terms は 1〜2 文。値引き / 振込先 / キャンセル料の文言は店舗が後付けするので最低限にとどめる

confidence: 0.0〜1.0 で自己評価 (参照できた実績件数が少ない場合は低めに)。`.trim();

/**
 * 高精度見積もりを生成する。
 *
 * pricingContext が空、または AI 呼び出しに失敗した場合は基本版へフォールバックする。
 */
export async function generateEnhancedQuote(input: EnhancedQuoteInput): Promise<EnhancedQuoteResult> {
  const patterns = input.pricingContext?.patterns ?? [];

  // 要望サービスごとに最も近い実勢パターンを引く
  const matches: Array<{ service: string; pattern: PricingPattern }> = [];
  const seenPatterns = new Set<PricingPattern>();
  for (const service of input.requestedServices) {
    const p = matchPattern(patterns, service, input.vehicle.maker);
    if (p && !seenPatterns.has(p)) {
      matches.push({ service, pattern: p });
      seenPatterns.add(p);
    }
  }

  // 実勢データが無い or API キー無しは基本版にフォールバック (patterns_used=0)
  if (matches.length === 0 || !process.env.ANTHROPIC_API_KEY) {
    const base = await generateQuoteFromVehicle(input);
    return { ...base, patterns_used: matches.length };
  }

  const baseline = buildDeterministicQuote(input);
  const marketSection = buildMarketPricingSection(matches);

  const facts: string[] = [
    `カテゴリ: ${input.serviceCategory}`,
    `車両: ${[input.vehicle.maker, input.vehicle.model, input.vehicle.size_class].filter(Boolean).join(" ")}`,
  ];
  if (input.customerName) facts.push(`顧客: ${input.customerName}`);
  facts.push(`要望サービス: ${input.requestedServices.join(" / ")}`);
  facts.push(`【過去成約実績 (実勢価格)】\n${marketSection}`);
  facts.push(
    `現時点の deterministic な下書き: ${baseline.items
      .map((i) => `${i.description} ¥${i.unit_price}`)
      .join(" / ")} (合計 ¥${baseline.total})`,
  );

  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL,
        max_tokens: 1536,
        system: ENHANCED_SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(QuoteSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed || parsed.items.length === 0) {
      const base = await generateQuoteFromVehicle(input);
      return { ...base, patterns_used: matches.length };
    }
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
      patterns_used: matches.length,
    };
  } catch (err) {
    console.error("[enhancedQuote] generation failed, falling back:", err);
    const base = await generateQuoteFromVehicle(input);
    return { ...base, patterns_used: matches.length };
  }
}
