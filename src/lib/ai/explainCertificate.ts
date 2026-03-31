/**
 * B-2: 証明内容の説明変換（オーディエンス別）
 *
 * 同一の証明書データを、相手（顧客・保険会社・社内・営業）に
 * 合わせた表現に自動変換する。
 */
import { getAnthropicClient, AI_MODEL, parseJsonResponse } from "@/lib/ai/client";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type Audience = "customer" | "insurer" | "internal" | "sales";

export interface ExplainCertificateInput {
  audience: Audience;
  certificate: {
    public_id: string;
    service_name: string;
    description?: string;
    warranty_period?: string;
    issued_at: string;
    expiry_date?: string;
    material_info?: string;
    work_areas?: string;
    public_url?: string;
  };
  vehicle: {
    maker?: string;
    model?: string;
    color?: string;
    plate_display?: string;
  };
  shop: {
    name: string;
    phone?: string;
  };
  customer?: {
    name?: string;
  };
}

export interface ExplanationResult {
  audience: Audience;
  subject: string;
  headline: string;
  body: string;
  keyPoints: string[];
  callToAction?: string;
  warningFlags?: string[];
  internalMemo?: string;
  shareableUrl?: string;
}

// ─────────────────────────────────────────────
// オーディエンス別プロンプト設定
// ─────────────────────────────────────────────

const AUDIENCE_INSTRUCTIONS: Record<Audience, string> = {
  customer: `
・トーン: 親しみやすく、安心感を与える口調
・専門用語は平易な言葉に言い換える
・強調すること: 施工の耐久性、見た目の美しさ、安心保証
・含めないこと: 原価・工数・社内コスト
・必ず含めること: 次回点検・メンテナンスの提案
・件名は「【〇〇様】〇〇の施工が完了しました」形式
`,
  insurer: `
・トーン: 正確・フォーマル・客観的
・専門用語はそのまま使用する
・強調すること: 施工の根拠、使用材料の正式名称・品番、改ざん防止、タイムスタンプ
・含めないこと: 次回提案・マーケティング的表現
・必ず含めること: 証明書公開URL、施工日時、保証期間の明確な記載
・件名は「施工証明書（〇〇）確認のご連絡」形式
`,
  internal: `
・トーン: 実務的・簡潔
・略語・業界用語OK
・強調すること: 作業内容・工程、担当者へのメモ事項
・含めないこと: 顧客個人情報の詳細
・必ず含めること: 施工カテゴリ、材料一覧、施工箇所リスト
・件名は「施工記録 #〇〇」形式
`,
  sales: `
・トーン: 実績を示す営業・マーケティング向け
・強調すること: 施工品質・ビフォーアフター・保証の手厚さ
・含めないこと: 個人情報・価格
・必ず含めること: 施工事例としての価値訴求
・件名は「施工事例: 〇〇」形式
`,
};

// ─────────────────────────────────────────────
// 説明変換生成
// ─────────────────────────────────────────────

export async function generateExplanation(
  input: ExplainCertificateInput
): Promise<ExplanationResult> {
  const client = getAnthropicClient();
  const instruction = AUDIENCE_INSTRUCTIONS[input.audience];

  const certInfo = `
施工名: ${input.certificate.service_name}
施工説明: ${input.certificate.description ?? "なし"}
使用材料: ${input.certificate.material_info ?? "なし"}
施工箇所: ${input.certificate.work_areas ?? "なし"}
保証期間: ${input.certificate.warranty_period ?? "なし"}
施工日: ${input.certificate.issued_at}
有効期限: ${input.certificate.expiry_date ?? "なし"}
証明書URL: ${input.certificate.public_url ?? "なし"}
証明書ID: ${input.certificate.public_id}`;

  const vehicleInfo = `
車種: ${[input.vehicle.maker, input.vehicle.model].filter(Boolean).join(" ") || "不明"}
カラー: ${input.vehicle.color ?? "不明"}
ナンバー: ${input.vehicle.plate_display ?? "非公開"}`;

  const systemPrompt = `あなたは自動車施工証明書の文章作成支援AIです。
証明書データを、以下の指示に従って指定した相手向けの文章に変換してください。

【相手向け指示】
${instruction}

必ず以下のJSON形式のみで回答してください:
{
  "subject": "件名",
  "headline": "1行サマリ（30文字以内）",
  "body": "本文（Markdown形式可、300文字以内）",
  "keyPoints": ["ポイント1", "ポイント2", "ポイント3"],
  "callToAction": "次のアクション（顧客向けのみ、他はnull）",
  "warningFlags": ["確認事項1"]（保険会社向けのみ、他はnull）,
  "internalMemo": "社内メモ（社内向けのみ、他はnull）"
}`;

  const userMessage = `以下の証明書情報を「${input.audience}」向けの文章に変換してください。

【証明書情報】
${certInfo}

【車両情報】
${vehicleInfo}

【施工店】
${input.shop.name}${input.shop.phone ? ` / TEL: ${input.shop.phone}` : ""}

【顧客名】
${input.customer?.name ?? "非公開"}`;

  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

  try {
    const result = parseJsonResponse<Omit<ExplanationResult, "audience" | "shareableUrl">>(text);
    return {
      audience: input.audience,
      subject: result.subject ?? "",
      headline: result.headline ?? "",
      body: result.body ?? "",
      keyPoints: result.keyPoints ?? [],
      callToAction: result.callToAction ?? undefined,
      warningFlags: result.warningFlags ?? undefined,
      internalMemo: result.internalMemo ?? undefined,
      shareableUrl: input.certificate.public_url,
    };
  } catch {
    throw new Error(`AI説明変換の解析に失敗しました: ${text.slice(0, 200)}`);
  }
}
