/**
 * C-2: Academy AIフィードバック（添削モード）
 *
 * 証明書の内容・写真品質を総合評価し、
 * 学習フィードバックとLedra Standard達成状況を返す。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL, AI_MODEL_FAST } from "@/lib/ai/client";

const FeedbackStrengthSchema = z.object({
  area: z.string(),
  comment: z.string(),
});

const FeedbackImprovementSchema = z.object({
  area: z.string(),
  issue: z.string(),
  suggestion: z.string(),
  example: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]),
});

const StandardStatusSchema = z.object({
  basic: z.boolean(),
  standard: z.boolean(),
  pro: z.boolean(),
  nextStep: z.string(),
});

const CertificateFeedbackSchema = z.object({
  overallGrade: z.enum(["S", "A", "B", "C", "D"]),
  score: z.number(),
  strengths: z.array(FeedbackStrengthSchema),
  improvements: z.array(FeedbackImprovementSchema),
  standardStatus: StandardStatusSchema,
  encouragement: z.string(),
});

const AcademyCaseSummarySchema = z.object({
  aiSummary: z.string(),
  goodPoints: z.array(z.string()),
  cautionPoints: z.array(z.string()),
  tags: z.array(z.string()),
  difficulty: z.number(),
});

const EMPTY_FEEDBACK: Omit<CertificateFeedbackResult, "similarGoodCases"> = {
  overallGrade: "C",
  score: 50,
  strengths: [],
  improvements: [],
  standardStatus: {
    basic: false,
    standard: false,
    pro: false,
    nextStep: "AI フィードバック生成に失敗しました。再試行してください。",
  },
  encouragement: "AI フィードバック生成に失敗しました。",
};

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type FeedbackGrade = "S" | "A" | "B" | "C" | "D";

export interface FeedbackStrength {
  area: string;
  comment: string;
}

export interface FeedbackImprovement {
  area: string;
  issue: string;
  suggestion: string;
  example?: string;
  priority: "high" | "medium" | "low";
}

export interface SimilarGoodCase {
  caseId: string;
  learnPoint: string;
}

export interface StandardStatus {
  basic: boolean;
  standard: boolean;
  pro: boolean;
  nextStep: string;
}

export interface CertificateFeedbackResult {
  overallGrade: FeedbackGrade;
  score: number;
  strengths: FeedbackStrength[];
  improvements: FeedbackImprovement[];
  similarGoodCases: SimilarGoodCase[];
  standardStatus: StandardStatus;
  encouragement: string; // 学習意欲を高めるメッセージ
}

export interface CertificateFeedbackInput {
  certificate: {
    service_name: string;
    description?: string;
    material_info?: string;
    warranty_period?: string;
    work_areas?: string;
    photo_count: number;
    category?: string;
  };
  qualityScore?: number;
  missingFields?: string[];
  warningMessages?: string[];
  similarGoodCases?: SimilarGoodCase[];
}

// ─────────────────────────────────────────────
// AIフィードバック生成
// ─────────────────────────────────────────────

export async function generateCertificateFeedback(
  input: CertificateFeedbackInput,
  opts?: { model?: string },
): Promise<CertificateFeedbackResult> {
  const client = getAnthropicClient();

  const systemPrompt = `あなたはLedra Academy の施工証明書品質コーチです。
受講者（施工店スタッフ）が作成した証明書を添削し、
建設的・教育的なフィードバックをJSON形式で提供してください。

回答形式（JSONのみ）:
{
  "overallGrade": "S|A|B|C|D",
  "score": 0〜100,
  "strengths": [
    {"area": "評価項目名", "comment": "具体的に良かった点（50文字以内）"}
  ],
  "improvements": [
    {
      "area": "改善項目名",
      "issue": "問題点（30文字以内）",
      "suggestion": "改善提案（50文字以内）",
      "priority": "high|medium|low"
    }
  ],
  "standardStatus": {
    "basic": true/false,
    "standard": true/false,
    "pro": true/false,
    "nextStep": "次のレベルに必要なこと（30文字以内）"
  },
  "encouragement": "学習意欲を高める一言メッセージ（50文字以内）"
}

採点基準:
- S(95〜): 完璧。全項目クリア、写真5枚以上、材料詳細記載
- A(80〜): 優良。ほぼ基準クリア、軽微な改善余地
- B(65〜): 良好。主要項目OK、いくつか改善点あり
- C(50〜): 基準未達。重要な不足事項あり
- D(〜50): 要改善。複数の重大な問題あり`;

  const userMessage = `以下の証明書を添削してください。

【施工名】${input.certificate.service_name}
【施工説明】${input.certificate.description ?? "（未記載）"}
【使用材料】${input.certificate.material_info ?? "（未記載）"}
【保証期間】${input.certificate.warranty_period ?? "（未設定）"}
【施工箇所】${input.certificate.work_areas ?? "（未記載）"}
【写真枚数】${input.certificate.photo_count}枚
【施工カテゴリ】${input.certificate.category ?? "不明"}
【品質スコア（自動）】${input.qualityScore ?? "未計算"}
【不足項目】${input.missingFields?.join(", ") || "なし"}
【警告事項】${input.warningMessages?.join(", ") || "なし"}`;

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(CertificateFeedbackSchema) },
      }),
    );

    const result = msg.parsed_output;
    if (!result) return { ...EMPTY_FEEDBACK, similarGoodCases: input.similarGoodCases ?? [] };
    return {
      overallGrade: result.overallGrade,
      score: result.score,
      strengths: result.strengths,
      improvements: result.improvements,
      similarGoodCases: input.similarGoodCases ?? [],
      standardStatus: result.standardStatus,
      encouragement: result.encouragement,
    };
  } catch (err) {
    console.error("[academyFeedback] generation failed:", err);
    return { ...EMPTY_FEEDBACK, similarGoodCases: input.similarGoodCases ?? [] };
  }
}

// ─────────────────────────────────────────────
// 事例自動タグ付け＆要約生成
// ─────────────────────────────────────────────

export interface AcademyCaseSummary {
  aiSummary: string;
  goodPoints: string[];
  cautionPoints: string[];
  tags: string[];
  difficulty: number;
}

export async function generateAcademyCaseSummary(
  params: {
    serviceName: string;
    description?: string;
    materialInfo?: string;
    category: string;
    qualityScore: number;
    photoCount: number;
  },
  opts?: { model?: string },
): Promise<AcademyCaseSummary> {
  const client = getAnthropicClient();

  const systemPrompt = `あなたはLedra Academy の教材作成AIです。
施工事例から学習教材用の要約・解説を生成してください。

回答形式（JSONのみ）:
{
  "aiSummary": "この事例の学習ポイント要約（100文字以内）",
  "goodPoints": ["良い点1（30文字以内）", "良い点2", "良い点3"],
  "cautionPoints": ["注意点1（30文字以内）", "注意点2"],
  "tags": ["タグ1", "タグ2", "タグ3"],
  "difficulty": 1〜5の整数
}`;

  const userMessage = `以下の施工事例の教材要約を作成してください。

施工名: ${params.serviceName}
説明: ${params.description ?? "なし"}
材料: ${params.materialInfo ?? "なし"}
カテゴリ: ${params.category}
品質スコア: ${params.qualityScore}
写真枚数: ${params.photoCount}枚`;

  const fallback: AcademyCaseSummary = {
    aiSummary: `${params.category}カテゴリの施工事例（品質スコア: ${params.qualityScore}）`,
    goodPoints: [],
    cautionPoints: [],
    tags: [params.category],
    difficulty: 3,
  };

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(AcademyCaseSummarySchema) },
      }),
    );

    return msg.parsed_output ?? fallback;
  } catch (err) {
    console.error("[academyFeedback] case summary failed:", err);
    return fallback;
  }
}

// ─────────────────────────────────────────────
// グレードから日本語ラベルへ
// ─────────────────────────────────────────────
export const GRADE_LABELS: Record<FeedbackGrade, { label: string; color: string }> = {
  S: { label: "最優秀", color: "text-yellow-600" },
  A: { label: "優良", color: "text-green-600" },
  B: { label: "良好", color: "text-blue-600" },
  C: { label: "基準未達", color: "text-orange-600" },
  D: { label: "要改善", color: "text-red-600" },
};
