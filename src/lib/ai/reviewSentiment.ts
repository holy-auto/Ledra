/**
 * 顧客レビュー / NPS のセンチメント解析 + 1 行サマリ + 話題タグ抽出。
 *
 * - 入力: レビュー本文 + NPS スコア (0〜10、任意)
 * - 出力: positive / neutral / negative + summary (50 字以内) + topics[]
 *
 * `topics` は店舗側の改善ループに使えるタグ群:
 * ["施工品質", "接客", "価格", "待ち時間", "店舗環境", "予約のしやすさ", "保証",
 *  "コミュニケーション", "その他"] のいずれか複数。
 *
 * Haiku 失敗時は NPS スコアと簡易ルールでフォールバック判定。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export type Sentiment = "positive" | "neutral" | "negative";

const TOPICS = [
  "施工品質",
  "接客",
  "価格",
  "待ち時間",
  "店舗環境",
  "予約のしやすさ",
  "保証",
  "コミュニケーション",
  "その他",
] as const;
export type ReviewTopic = (typeof TOPICS)[number];

export interface ReviewSentimentInput {
  text: string;
  /** NPS スコア (0〜10)。あれば AI 判定のヒントに使う */
  npsScore?: number | null;
  /** 顧客が施工後何日経って書いたか (任意) */
  daysSinceCertificate?: number | null;
}

const ResultSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  summary: z.string().max(120),
  topics: z.array(z.enum(TOPICS)).max(5),
  actionable: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export interface ReviewSentimentResult {
  sentiment: Sentiment;
  summary: string;
  topics: ReviewTopic[];
  /** 店舗側が改善アクションを取れる内容か (negative + 具体的指摘がある場合 true) */
  actionable: boolean;
  confidence: number;
  ai: boolean;
}

export function buildDeterministicSentiment(input: ReviewSentimentInput): ReviewSentimentResult {
  let sentiment: Sentiment = "neutral";
  if (input.npsScore != null) {
    if (input.npsScore >= 9) sentiment = "positive";
    else if (input.npsScore <= 6) sentiment = "negative";
  }
  return {
    sentiment,
    summary: input.text.slice(0, 80).replace(/\s+/g, " ").trim(),
    topics: [],
    actionable: sentiment === "negative",
    confidence: input.npsScore != null ? 0.5 : 0.2,
    ai: false,
  };
}

const SYSTEM_PROMPT = `あなたは自動車施工店の品質改善担当です。
顧客レビューを 1 件受け取り、センチメントと話題タグを抽出してください。

ルール:
- sentiment: positive (満足), neutral (中立 / 部分的満足), negative (不満)
- NPS が 9-10 = positive、7-8 = neutral、0-6 = negative の傾向 (本文と矛盾する場合は本文を優先)
- summary: 50 字以内、店舗スタッフが「何があったか」を 1 行で把握できる文
- topics: 与えたタグ一覧から該当するものを最大 5 つ (推測ベースの追加禁止)
- actionable: 店舗が改善できる具体的指摘 (待ち時間 / 接客 / 品質) があれば true、
  単なる称賛や個人的事情なら false
- confidence: 0.0〜1.0 (短文 / 内容が薄ければ低め)`.trim();

export async function analyzeReviewSentiment(input: ReviewSentimentInput): Promise<ReviewSentimentResult> {
  const baseline = buildDeterministicSentiment(input);
  if (!process.env.ANTHROPIC_API_KEY) return baseline;
  if (!input.text.trim()) return baseline;

  const client = getAnthropicClient();
  const facts: string[] = [`本文:\n${input.text.slice(0, 3000)}`];
  if (input.npsScore != null) facts.push(`NPS スコア: ${input.npsScore}`);
  if (input.daysSinceCertificate != null) facts.push(`施工後経過日数: ${input.daysSinceCertificate} 日`);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(ResultSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return baseline;
    return {
      sentiment: parsed.sentiment,
      summary: parsed.summary,
      topics: parsed.topics,
      actionable: parsed.actionable,
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[reviewSentiment] failed:", err);
    return baseline;
  }
}
