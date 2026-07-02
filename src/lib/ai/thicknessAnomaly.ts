/**
 * 塗膜厚レポートの異常検知。
 *
 * PosiTector / DeFelsko 系から取り込んだ複数測定値を統計的に評価:
 *   - 平均 / 標準偏差 / 範囲 / 外れ値 (|z| > 2.5)
 *   - 想定値域 (車両 / 施工タイプ別) から逸脱しているか
 *
 * 統計判定後、異常が見つかった場合のみ Haiku に「保険会社向け説明文」を
 * 1〜2 行で生成させる。レポート単位の出力なので頻繁には呼ばれない想定。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface ThicknessMeasurement {
  /** 計測値 (μm) */
  value: number;
  /** 計測箇所ラベル (任意) */
  location?: string;
}

export interface ThicknessAnomalyInput {
  measurements: ThicknessMeasurement[];
  /** 車両 / 施工別の想定値域 (μm)。指定があれば範囲外チェックも行う。 */
  expectedRange?: { min: number; max: number };
  /** 施工メニュー名 (AI 文章化用、任意) */
  serviceName?: string | null;
}

export interface ThicknessAnomalyStats {
  count: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  /** |z| > 2.5 の測定点 */
  outliers: Array<{ index: number; value: number; z: number; location?: string }>;
  /** expectedRange を逸脱した測定点 */
  outOfRange: Array<{ index: number; value: number; location?: string }>;
}

export interface ThicknessAnomalyResult {
  stats: ThicknessAnomalyStats;
  severity: "ok" | "watch" | "alert";
  /** 1〜2 行の説明文 (severity!=ok のときのみ生成) */
  comment: string;
  ai: boolean;
}

const AiCommentSchema = z.object({
  comment: z.string().max(240),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは自動車塗装の品質トレースを支援するアシスタントです。
塗膜厚計測値の異常統計を受け取り、保険会社や顧客に説明するための短いコメントを
1〜2 行 (各 80 字以内、句点で終わる) で返してください。

ルール:
- 推測表現禁止、事実だけ
- 「再施工を検討してください」のような行動指示は OK
- 「保証適用外」「契約違反」のような法的判断は書かない
- 改行 / 絵文字禁止`.trim();

export function analyzeThicknessStats(input: ThicknessAnomalyInput): ThicknessAnomalyStats {
  const values = input.measurements.map((m) => m.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) {
    return { count: 0, mean: 0, stddev: 0, min: 0, max: 0, outliers: [], outOfRange: [] };
  }
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  const outliers: ThicknessAnomalyStats["outliers"] = [];
  if (stddev > 0) {
    input.measurements.forEach((m, i) => {
      if (!Number.isFinite(m.value)) return;
      const z = (m.value - mean) / stddev;
      if (Math.abs(z) > 2.5) outliers.push({ index: i, value: m.value, z, location: m.location });
    });
  }
  const outOfRange: ThicknessAnomalyStats["outOfRange"] = [];
  if (input.expectedRange) {
    input.measurements.forEach((m, i) => {
      if (!Number.isFinite(m.value)) return;
      if (m.value < input.expectedRange!.min || m.value > input.expectedRange!.max) {
        outOfRange.push({ index: i, value: m.value, location: m.location });
      }
    });
  }
  return {
    count: values.length,
    mean: Math.round(mean * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    outliers,
    outOfRange,
  };
}

export function classifyThicknessSeverity(stats: ThicknessAnomalyStats): "ok" | "watch" | "alert" {
  if (stats.outOfRange.length > 0) return "alert";
  if (stats.outliers.length >= 3) return "alert";
  if (stats.outliers.length >= 1) return "watch";
  return "ok";
}

export async function detectThicknessAnomaly(
  input: ThicknessAnomalyInput,
  opts?: { model?: string },
): Promise<ThicknessAnomalyResult> {
  const stats = analyzeThicknessStats(input);
  const severity = classifyThicknessSeverity(stats);

  if (severity === "ok") {
    return { stats, severity, comment: "", ai: false };
  }

  const fallback = buildFallbackComment(stats, severity, input);
  if (!process.env.ANTHROPIC_API_KEY) {
    return { stats, severity, comment: fallback, ai: false };
  }

  const client = getAnthropicClient();
  const facts = [
    `施工: ${input.serviceName ?? "(未指定)"}`,
    `測定数: ${stats.count}`,
    `平均: ${stats.mean} μm`,
    `標準偏差: ${stats.stddev} μm`,
    `最小〜最大: ${stats.min}〜${stats.max} μm`,
    input.expectedRange ? `想定値域: ${input.expectedRange.min}〜${input.expectedRange.max} μm` : null,
    `外れ値 (|z|>2.5): ${stats.outliers.length} 点`,
    `想定値域逸脱: ${stats.outOfRange.length} 点`,
    `判定: ${severity}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts }],
        output_config: { format: zodOutputFormat(AiCommentSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return { stats, severity, comment: fallback, ai: false };
    return { stats, severity, comment: parsed.comment || fallback, ai: true };
  } catch (err) {
    console.error("[thicknessAnomaly] failed:", err);
    return { stats, severity, comment: fallback, ai: false };
  }
}

function buildFallbackComment(
  stats: ThicknessAnomalyStats,
  severity: "watch" | "alert",
  input: ThicknessAnomalyInput,
): string {
  if (severity === "alert") {
    if (stats.outOfRange.length > 0) {
      return `想定値域 ${input.expectedRange?.min}〜${input.expectedRange?.max}μm を逸脱した測定点が ${stats.outOfRange.length} 点あります。再計測または再施工を検討してください。`;
    }
    return `平均 ${stats.mean}μm に対して外れ値が ${stats.outliers.length} 点あります。再計測を推奨します。`;
  }
  return `平均 ${stats.mean}μm。1 点だけ統計的に乖離した測定が見られます。計測条件を確認してください。`;
}
