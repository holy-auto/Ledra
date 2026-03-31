/**
 * B-1: 施工証明の自動下書き生成
 *
 * 車両情報・ヒアリングデータ・過去類似証明書・写真から
 * 証明書の各項目を自動入力する。
 */
import { getAnthropicClient, AI_MODEL, parseJsonResponse } from "@/lib/ai/client";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface DraftCertificateInput {
  vehicle: {
    maker?: string;
    model?: string;
    year?: number;
    color?: string;
    vin?: string;
    size_class?: string;
  };
  hearing?: {
    service_types?: string[];
    budget_range?: string;
    parking_type?: string;
    customer_requests?: string;
  };
  similarCertificates: Array<{
    service_name: string;
    description?: string;
    material_info?: string;
    warranty_period?: string;
  }>;
  photoDescriptions?: string[];  // Vision解析済みの写真説明
  templateCategory?: string;
}

export interface DraftMaterial {
  name: string;
  maker?: string;
  spec?: string;
  note?: string;
}

export interface DraftCertificateResult {
  title: string;                    // 施工タイトル
  description: string;              // 施工内容説明
  materials: DraftMaterial[];       // 使用材料リスト
  warrantyCandidates: string[];     // 保証期間候補 ["3年", "5年"]
  workAreas: string[];              // 施工箇所リスト
  cautions: string;                 // 注意事項
  confidence: number;               // 0.0〜1.0
  missingInfo: string[];            // 不足情報リスト
}

// ─────────────────────────────────────────────
// 自動下書き生成
// ─────────────────────────────────────────────

export async function generateCertificateDraft(
  input: DraftCertificateInput
): Promise<DraftCertificateResult> {
  const client = getAnthropicClient();

  const vehicleDesc = [
    input.vehicle.maker,
    input.vehicle.model,
    input.vehicle.year ? `${input.vehicle.year}年式` : null,
    input.vehicle.color ? `${input.vehicle.color}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const hearingDesc = input.hearing
    ? [
        input.hearing.service_types?.length
          ? `希望施工: ${input.hearing.service_types.join(", ")}`
          : null,
        input.hearing.budget_range ? `予算: ${input.hearing.budget_range}` : null,
        input.hearing.parking_type ? `駐車環境: ${input.hearing.parking_type}` : null,
        input.hearing.customer_requests
          ? `顧客要望: ${input.hearing.customer_requests}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "なし";

  const similarDesc =
    input.similarCertificates.length > 0
      ? input.similarCertificates
          .map(
            (c, i) =>
              `事例${i + 1}: 施工名=${c.service_name}, 保証=${c.warranty_period ?? "不明"}`
          )
          .join("\n")
      : "なし";

  const systemPrompt = `あなたは自動車施工店の施工証明書作成を支援するAIアシスタントです。
提供された情報を元に、施工証明書の各項目の候補を生成してください。

必ず以下のJSON形式のみで回答してください（余分な説明不要）:
{
  "title": "施工タイトル（簡潔に20文字以内）",
  "description": "施工内容の説明文（100〜200文字、専門的かつ顧客にも分かりやすく）",
  "materials": [
    {"name": "材料名", "maker": "メーカー名（不明なら省略）", "spec": "規格・型番（不明なら省略）", "note": "備考（あれば）"}
  ],
  "warrantyCandidates": ["3年", "5年"],
  "workAreas": ["ボンネット", "ルーフ", "フード"],
  "cautions": "注意事項（車種・施工固有のもの、なければ空文字）",
  "confidence": 0.85,
  "missingInfo": ["不足している情報のリスト（あれば）"]
}`;

  const userMessage = `以下の情報から施工証明書の下書きを作成してください。

【車両情報】
${vehicleDesc || "不明"}

【ヒアリング情報】
${hearingDesc}

【過去の類似施工事例】
${similarDesc}

【写真から検出された内容】
${input.photoDescriptions?.join("\n") || "なし"}

【施工カテゴリ】
${input.templateCategory || "未指定"}`;

  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

  try {
    const result = parseJsonResponse<DraftCertificateResult>(text);
    return {
      title: result.title ?? "",
      description: result.description ?? "",
      materials: result.materials ?? [],
      warrantyCandidates: result.warrantyCandidates ?? ["1年", "3年"],
      workAreas: result.workAreas ?? [],
      cautions: result.cautions ?? "",
      confidence: result.confidence ?? 0.7,
      missingInfo: result.missingInfo ?? [],
    };
  } catch {
    throw new Error(`AI下書き生成の解析に失敗しました: ${text.slice(0, 200)}`);
  }
}
