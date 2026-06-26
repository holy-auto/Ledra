/**
 * メニュー (品目) の推奨価格算出。
 *
 * 入力:
 *   - 同テナント / 同カテゴリの過去請求書明細 (実販売価格、最新 30 件)
 *   - price_stats からのテナント横断中央値 (任意)
 *   - 対象車両サイズ
 *
 * 出力:
 *   - 推奨単価 / 価格バンド (min, p50, max) / 自信度 / 根拠 1 行
 *
 * deterministic な中央値計算をベースに、Haiku が「相場感」と理由文を被せる。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { sizeMultiplier } from "@/lib/ai/utils";

export interface MenuPriceInput {
  menuName: string;
  vehicleSize?: string | null;
  /** 自店過去の同名 / 類似メニュー販売単価 */
  ownSales: number[];
  /** 業界中央値 (price_stats から、任意) */
  marketMedian?: number | null;
}

export interface MenuPriceResult {
  recommended_price: number;
  band: { min: number; p50: number; max: number };
  confidence: number;
  rationale: string;
  ai: boolean;
}

const AiSchema = z.object({
  recommended_price: z.number().int().min(0),
  rationale: z.string().max(160),
  confidence: z.number().min(0).max(1),
});

export function calculatePriceBand(input: MenuPriceInput): {
  band: { min: number; p50: number; max: number };
  baseline: number;
} {
  const sales = [...input.ownSales].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sales.length === 0) {
    const m = input.marketMedian && input.marketMedian > 0 ? input.marketMedian : 0;
    return { band: { min: m, p50: m, max: m }, baseline: Math.round(m * sizeMultiplier(input.vehicleSize)) };
  }
  const p50 = sales[Math.floor(sales.length / 2)];
  const min = sales[0];
  const max = sales[sales.length - 1];
  const baseline = Math.round(p50 * sizeMultiplier(input.vehicleSize));
  return { band: { min, p50, max }, baseline };
}

export async function estimateMenuPrice(input: MenuPriceInput, opts?: { model?: string }): Promise<MenuPriceResult> {
  const { band, baseline } = calculatePriceBand(input);
  const fallback: MenuPriceResult = {
    recommended_price: baseline,
    band,
    confidence: input.ownSales.length >= 3 ? 0.7 : 0.3,
    rationale:
      input.ownSales.length === 0
        ? input.marketMedian
          ? `業界中央値 ¥${input.marketMedian.toLocaleString("ja-JP")} を基準値に設定`
          : "過去データ無し、ベース価格を 0 で返却"
        : `自店過去 ${input.ownSales.length} 件の中央値 ¥${band.p50.toLocaleString("ja-JP")} に車両サイズ係数を適用`,
    ai: false,
  };

  if (!process.env.ANTHROPIC_API_KEY || input.ownSales.length === 0) return fallback;

  const client = getAnthropicClient();
  const facts = [
    `メニュー: ${input.menuName}`,
    `車両サイズ: ${input.vehicleSize ?? "(不明)"}`,
    `自店過去販売価格 (${input.ownSales.length} 件): 最小 ¥${band.min} / 中央 ¥${band.p50} / 最大 ¥${band.max}`,
    input.marketMedian ? `業界中央値: ¥${input.marketMedian}` : null,
    `deterministic baseline: ¥${baseline}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 384,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts }],
        output_config: { format: zodOutputFormat(AiSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return fallback;
    return {
      recommended_price: parsed.recommended_price,
      band,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
      ai: true,
    };
  } catch (err) {
    console.error("[menuPriceEstimate] failed:", err);
    return fallback;
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店の価格設定を支援するアシスタントです。
過去販売実績と業界中央値から、推奨単価 (税抜き整数円) と理由文を 1 つ返してください。

ルール:
- 自店過去価格バンドから外れた極端な値は出さない (min ÷ 0.8 〜 max × 1.2 の範囲内)
- 業界中央値とのギャップが大きい場合は理由文に明記
- rationale は 100 字以内、1 文`.trim();
