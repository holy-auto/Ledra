/**
 * 顧客問い合わせ (customer_inquiries) の自動分類 + 返信下書き。
 *
 * 入力: subject + message + (任意で顧客の過去施工履歴)
 * 出力: category / priority / suggested_status / draft_reply
 *
 * - category は事前定義 8 種 (technical / billing / reservation / warranty /
 *   complaint / praise / quote_request / other) のいずれか
 * - priority は high / med / low
 * - draft_reply は店舗トーンに合わせた 200 字程度の下書き (敬語、固有名詞は
 *   出さない)。送信前に必ず人がレビューする前提
 *
 * 失敗時は category="other" / priority="med" / draft_reply="" の safe default。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export type InquiryCategory =
  "technical" | "billing" | "reservation" | "warranty" | "complaint" | "praise" | "quote_request" | "other";

export type InquiryPriority = "high" | "med" | "low";

export interface InquiryClassifyInput {
  subject: string;
  message: string;
  customerHistory?: {
    name?: string;
    last_certificate_label?: string;
    days_since_last_visit?: number | null;
  };
  shopName?: string;
}

const ResultSchema = z.object({
  category: z.enum([
    "technical",
    "billing",
    "reservation",
    "warranty",
    "complaint",
    "praise",
    "quote_request",
    "other",
  ]),
  priority: z.enum(["high", "med", "low"]),
  draft_reply: z.string().max(800),
  reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
});

export interface InquiryClassifyResult {
  category: InquiryCategory;
  priority: InquiryPriority;
  draft_reply: string;
  reason: string;
  confidence: number;
  ai: boolean;
}

export function buildDeterministicClassification(input: InquiryClassifyInput): InquiryClassifyResult {
  const text = `${input.subject}\n${input.message}`.toLowerCase();
  let category: InquiryCategory = "other";
  let priority: InquiryPriority = "med";

  // 簡易キーワードルール (AI 不在時のフォールバック)
  if (/請求|金額|料金|支払い|入金|領収/.test(text)) category = "billing";
  else if (/予約|変更|キャンセル|空き/.test(text)) category = "reservation";
  else if (/保証|剥が|曇|劣化/.test(text)) category = "warranty";
  else if (/クレーム|怒|遅い|ひど|最悪/.test(text)) {
    category = "complaint";
    priority = "high";
  } else if (/ありがとう|良かった|素晴ら/.test(text)) {
    category = "praise";
    priority = "low";
  } else if (/見積|料金表|金額を/.test(text)) category = "quote_request";
  else if (/コーティング|フィルム|施工|可能/.test(text)) category = "technical";

  return {
    category,
    priority,
    draft_reply: "",
    reason: "AI 未呼び出し (キーワードルール)",
    confidence: 0.4,
    ai: false,
  };
}

const SYSTEM_PROMPT = `あなたは自動車施工店の顧客サポート担当です。
受信した問い合わせを分類し、丁寧な返信ドラフトを 1 件返してください。

分類カテゴリ:
- technical: 施工方法 / 適合 / 仕様の質問
- billing: 請求 / 入金 / 領収書
- reservation: 予約変更 / キャンセル / 空き確認
- warranty: 保証 / 不具合 / アフター対応
- complaint: 苦情 / 不満
- praise: 称賛 / 感謝
- quote_request: 見積もり依頼
- other: 上記以外

優先度:
- high: complaint, 緊急トラブル, 法的リスク
- med: 通常の質問・予約変更
- low: 一般的な情報照会・praise

返信下書き (draft_reply):
- 200〜300 字、敬体 (です/ます)
- 「ご連絡ありがとうございます」で開始
- 具体的金額や日付は答えない (確認後にスタッフが返す)
- "確認の上、改めてご連絡いたします。" で締める
- 絵文字 / 顔文字禁止
- 顧客名が分かっていれば冒頭に「<姓> 様」を付ける

confidence: 0.0〜1.0 で自己評価。`.trim();

export async function classifyInquiry(
  input: InquiryClassifyInput,
  opts?: { model?: string },
): Promise<InquiryClassifyResult> {
  const baseline = buildDeterministicClassification(input);
  if (!process.env.ANTHROPIC_API_KEY) return baseline;

  const client = getAnthropicClient();
  const facts: string[] = [];
  if (input.shopName) facts.push(`店舗: ${input.shopName}`);
  if (input.customerHistory?.name) facts.push(`顧客名: ${input.customerHistory.name}`);
  if (input.customerHistory?.last_certificate_label) {
    facts.push(`直近施工: ${input.customerHistory.last_certificate_label}`);
  }
  if (input.customerHistory?.days_since_last_visit != null) {
    facts.push(`最終来店: ${input.customerHistory.days_since_last_visit} 日前`);
  }
  facts.push(`件名: ${input.subject}`);
  facts.push(`本文:\n${input.message}`);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(ResultSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return baseline;
    return {
      category: parsed.category,
      priority: parsed.priority,
      draft_reply: parsed.draft_reply,
      reason: parsed.reason,
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[inquiryClassify] failed:", err);
    return baseline;
  }
}
