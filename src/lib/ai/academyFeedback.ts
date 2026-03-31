/**
 * C-2: Academy AIフィードバック（添削モード）
 *
 * 証明書の内容・写真品質を総合評価し、
 * 学習フィードバックとLedra Standard達成状況を返す。
 */
import { getAnthropicClient, AI_MODEL, parseJsonResponse } from "@/lib/ai/client";

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
  encouragement: string;  // 学習意欲を高めるメッセージ
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
  input: CertificateFeedbackInput
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

  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

  try {
    const result = parseJsonResponse<Omit<CertificateFeedbackResult, "similarGoodCases">>(text);
    return {
      overallGrade: result.overallGrade ?? "C",
      score: result.score ?? 50,
      strengths: result.strengths ?? [],
      improvements: result.improvements ?? [],
      similarGoodCases: input.similarGoodCases ?? [],
      standardStatus: result.standardStatus ?? {
        basic: false,
        standard: false,
        pro: false,
        nextStep: "施工写真を2枚以上追加してください",
      },
      encouragement: result.encouragement ?? "一歩一歩積み上げていきましょう！",
    };
  } catch {
    throw new Error(`Academyフィードバック解析に失敗しました: ${text.slice(0, 200)}`);
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

export async function generateAcademyCaseSummary(params: {
  serviceName: string;
  description?: string;
  materialInfo?: string;
  category: string;
  qualityScore: number;
  photoCount: number;
}): Promise<AcademyCaseSummary> {
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

  const msg = await client.messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

  try {
    return parseJsonResponse<AcademyCaseSummary>(text);
  } catch {
    return {
      aiSummary: `${params.category}カテゴリの施工事例（品質スコア: ${params.qualityScore}）`,
      goodPoints: [],
      cautionPoints: [],
      tags: [params.category],
      difficulty: 3,
    };
  }
}

// ─────────────────────────────────────────────
// グレードから日本語ラベルへ
// ─────────────────────────────────────────────
export const GRADE_LABELS: Record<FeedbackGrade, { label: string; color: string }> = {
  S: { label: "最優秀", color: "text-yellow-600" },
  A: { label: "優良",   color: "text-green-600" },
  B: { label: "良好",   color: "text-blue-600" },
  C: { label: "基準未達", color: "text-orange-600" },
  D: { label: "要改善",  color: "text-red-600" },
};
