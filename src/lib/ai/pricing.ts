/**
 * Anthropic モデルのトークン単価と、ai_usage_logs からのコスト概算。
 *
 * 単価は USD / 100万トークン (Anthropic 公開価格ベースの概算値)。
 * モデル世代で価格が変わるため、最終的な金額は Anthropic コンソールの
 * 請求と照合すること。為替は env `AI_USD_JPY` で上書き可能 (既定 150 円/$)。
 *
 * 注意: 現状 ai_usage_logs は input/output トークンのみ記録しており、
 * prompt cache の read/write トークンは別計上していない。そのため
 * キャッシュ読込分も通常 input 単価で見積もる = やや過大 (安全側) の概算になる。
 */

export interface ModelPricing {
  /** USD / 1M input tokens */
  input: number;
  /** USD / 1M output tokens */
  output: number;
  /** USD / 1M cache write tokens (通常 input の 1.25x) */
  cacheWrite?: number;
  /** USD / 1M cache read tokens (通常 input の 0.1x) */
  cacheRead?: number;
}

// プレフィックス一致で解決 (claude-opus-4-8 / claude-sonnet-4-6 / claude-haiku-4-5 等)。
// 具体的なモデル ID にバージョン日付が付いても拾えるよう startsWith で判定する。
const PRICING_BY_PREFIX: Array<[string, ModelPricing]> = [
  ["claude-opus", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  ["claude-sonnet", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ["claude-haiku", { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }],
];

/** 未知モデルは Sonnet 相当で見積もる (安全側の中位単価)。 */
const FALLBACK_PRICING: ModelPricing = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

export function pricingForModel(model: string | null | undefined): ModelPricing {
  if (!model) return FALLBACK_PRICING;
  const m = model.toLowerCase();
  for (const [prefix, p] of PRICING_BY_PREFIX) {
    if (m.startsWith(prefix)) return p;
  }
  return FALLBACK_PRICING;
}

export interface TokenCounts {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheWriteTokens?: number | null;
  cacheReadTokens?: number | null;
}

/** USD 概算コスト。 */
export function estimateCostUsd(model: string | null | undefined, t: TokenCounts): number {
  const p = pricingForModel(model);
  const inT = t.inputTokens ?? 0;
  const outT = t.outputTokens ?? 0;
  const cwT = t.cacheWriteTokens ?? 0;
  const crT = t.cacheReadTokens ?? 0;
  return (
    (inT * p.input + outT * p.output + cwT * (p.cacheWrite ?? p.input) + crT * (p.cacheRead ?? p.input)) / 1_000_000
  );
}

/** USD/JPY 換算レート (env `AI_USD_JPY`、既定 150)。 */
export function usdJpyRate(): number {
  const n = Number(process.env.AI_USD_JPY);
  return Number.isFinite(n) && n > 0 ? n : 150;
}

/** JPY (円) 概算コスト。 */
export function estimateCostJpy(model: string | null | undefined, t: TokenCounts, rate = usdJpyRate()): number {
  return estimateCostUsd(model, t) * rate;
}
