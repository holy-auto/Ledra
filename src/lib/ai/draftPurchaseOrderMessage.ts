/**
 * 発注メッセージ (発注書を仕入先/供給パートナーに送る本文) の AI 下書き生成。
 *
 * 壁3 (NEVER_AUTO_ACTIONS) との整合:
 *   - 数量・金額・明細は **決定論的に計算済み** のものを渡すだけ (AI は数値を作らない)。
 *     発注数量の算出は src/lib/inventory/reorder.ts (純関数) が担う。
 *   - AI が生成するのは「丁寧な日本語の発注依頼文 (件名 + 本文)」だけ。
 *   - 生成物は下書き。送信 (= 仕入先への金額コミット) は必ず人が確認してから行う。
 *
 * draftCertificate.ts と同じ作法: zodOutputFormat + withRetry("anthropic") + AI_MODEL +
 * cacheableSystem。失敗時は決定論的なフォールバック文面を返す (画面が空にならない)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL, cacheableSystem } from "@/lib/ai/client";

const PoMessageSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export interface PurchaseOrderMessageInput {
  shopName: string;
  supplierName: string;
  poNumber: string;
  /** 数量・単価は確定済み (AI には参照情報として渡すだけ)。 */
  items: Array<{ name: string; sku: string | null; quantity: number; unit_cost: number | null }>;
  subtotal: number;
  /** 希望納期や備考 (任意)。 */
  note?: string | null;
  desiredLeadTimeDays?: number | null;
}

export interface PurchaseOrderMessageResult {
  subject: string;
  body: string;
  /** AI 生成が失敗し決定論フォールバックを返したか。 */
  fallback: boolean;
}

/** items を読みやすい一覧テキストにする (プロンプト用)。 */
function formatItemsForPrompt(items: PurchaseOrderMessageInput["items"]): string {
  if (items.length === 0) return "（明細なし）";
  return items
    .map((l) => {
      const sku = l.sku ? ` [${l.sku}]` : "";
      const cost = l.unit_cost != null ? ` 単価¥${l.unit_cost.toLocaleString("ja-JP")}` : "";
      return `・${l.name}${sku} × ${l.quantity}${cost}`;
    })
    .join("\n");
}

/** 決定論フォールバック (AI 失敗時 / 文面の最低保証)。数値は入力をそのまま使う。 */
export function buildFallbackPurchaseOrderMessage(input: PurchaseOrderMessageInput): PurchaseOrderMessageResult {
  const lines = formatItemsForPrompt(input.items);
  const body =
    `${input.supplierName} 御中\n\n` +
    `いつもお世話になっております。${input.shopName}です。\n` +
    `下記の通り発注いたします。ご手配のほどよろしくお願いいたします。\n\n` +
    `発注番号: ${input.poNumber}\n\n` +
    `${lines}\n\n` +
    `概算合計: ¥${input.subtotal.toLocaleString("ja-JP")}\n` +
    (input.note ? `\n備考: ${input.note}\n` : "") +
    `\nお手数ですが、納期についてご連絡いただけますと幸いです。\n${input.shopName}`;
  return {
    subject: `【発注】${input.shopName}（${input.poNumber}）`,
    body,
    fallback: true,
  };
}

/**
 * 発注メッセージの下書きを生成する。AI が使えない/失敗した場合は決定論フォールバックを返す。
 */
export async function generatePurchaseOrderMessage(
  input: PurchaseOrderMessageInput,
  opts?: { model?: string },
): Promise<PurchaseOrderMessageResult> {
  const systemPrompt = `あなたは自動車整備・コーティング店の発注業務を支援するAIアシスタントです。
店舗が仕入先へ送る「発注依頼メール」の下書きを作成してください。

厳守事項:
- 数量・単価・合計金額は与えられた値を**そのまま**使うこと。勝手に増減・追加・削除しない。
- 新しい商品や金額を創作しない。
- 丁寧でビジネスとして自然な日本語にする。
- 件名は簡潔に、本文は宛名・差出人・発注番号・明細の確認・納期の問い合わせを含める。

必ず以下のJSON形式のみで回答してください:
{
  "subject": "メール件名",
  "body": "メール本文（改行を含む）"
}`;

  const userMessage = `以下の確定済み発注内容から、発注依頼メールの下書きを作成してください。

【差出人(店舗)】${input.shopName}
【宛先(仕入先)】${input.supplierName}
【発注番号】${input.poNumber}

【発注明細（数量・単価は確定済み・変更禁止）】
${formatItemsForPrompt(input.items)}

【概算合計】¥${input.subtotal.toLocaleString("ja-JP")}
${input.desiredLeadTimeDays != null ? `【希望納期目安】約${input.desiredLeadTimeDays}日` : ""}
${input.note ? `【備考】${input.note}` : ""}`;

  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL,
        max_tokens: 1024,
        system: cacheableSystem(systemPrompt),
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(PoMessageSchema) },
      }),
    );
    const result = msg.parsed_output;
    if (!result || !result.subject.trim() || !result.body.trim()) {
      return buildFallbackPurchaseOrderMessage(input);
    }
    return { subject: result.subject, body: result.body, fallback: false };
  } catch (err) {
    console.error("[draftPurchaseOrderMessage] generation failed:", err);
    return buildFallbackPurchaseOrderMessage(input);
  }
}
