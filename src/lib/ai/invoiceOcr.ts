/**
 * 請求書OCR（AI Vision）— 仕入先請求書 / 外注請求書の写真から明細を構造化抽出し、
 * 帳票フォーム（documents）の下書きに流し込む。
 *
 * 納品書OCR（deliveryNoteOcr.ts）と同型。請求書は明細＋合計＋支払期日を持つため、
 * invoice_number / issue_date / due_date / 税額を追加した。
 *
 * 方針: 読み取れない項目は null（推測で値を作らない）。抽出値は編集可能な下書きで、
 * 金額の確定・送付は必ず人が行う（壁3）。AI 呼び出し失敗時は fail-open で空明細。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_VISION } from "@/lib/ai/client";
import type { DocumentItem } from "@/types/document";

export const InvoiceLineSchema = z.object({
  description: z.string().describe("品名・摘要"),
  item_code: z.string().nullable().describe("品番。無ければ null"),
  quantity: z.number().describe("数量。不明なら 1"),
  unit_price_jpy: z.number().nullable().describe("単価（円）。不明なら null"),
  amount_jpy: z.number().nullable().describe("金額（円）。不明なら null"),
  tax_category: z.number().nullable().describe("税率(%): 10 または 8（軽減税率）。不明なら null"),
});

export const InvoiceSchema = z.object({
  supplier_name: z.string().nullable().describe("請求元（仕入先・外注先）名"),
  invoice_number: z.string().nullable().describe("請求書番号。無ければ null"),
  issue_date: z.string().nullable().describe("発行日 ISO。読めなければ null"),
  due_date: z.string().nullable().describe("支払期日 ISO。読めなければ null"),
  subtotal_jpy: z.number().nullable().describe("小計（税抜）。無ければ null"),
  tax_jpy: z.number().nullable().describe("消費税額。無ければ null"),
  total_jpy: z.number().nullable().describe("合計（税込）。無ければ null"),
  lines: z.array(InvoiceLineSchema),
});

export type InvoiceExtract = z.infer<typeof InvoiceSchema>;
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

const EMPTY: InvoiceExtract = {
  supplier_name: null,
  invoice_number: null,
  issue_date: null,
  due_date: null,
  subtotal_jpy: null,
  tax_jpy: null,
  total_jpy: null,
  lines: [],
};

/** 請求書画像から明細を抽出する。失敗時は fail-open で空明細を返す。 */
export async function extractInvoice(base64: string, mediaType: ImageMediaType): Promise<InvoiceExtract> {
  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_VISION,
        max_tokens: 2048,
        system: `あなたは自動車整備店の請求書を読み取る OCR アシスタントです。
仕入先請求書・外注請求書の写真から以下を正確に抽出し、JSON で返してください。
- 請求元名（supplier_name）
- 請求書番号（invoice_number）
- 発行日（issue_date）/ 支払期日（due_date）
- 小計(税抜) / 消費税額 / 合計(税込)
- 明細行：品名・品番・数量・単価・金額・税率(10 or 8)を1行ずつ
読み取れない項目は null にしてください。推測で値を作らないこと。`,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "この請求書の明細と金額を JSON で抽出してください。" },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(InvoiceSchema) },
      }),
    );
    return msg.parsed_output ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

/** 税率は 10% / 8% のみ許容。範囲外・null は既定 10 に寄せる。 */
function normalizeTaxCategory(v: number | null | undefined): number {
  return v === 8 ? 8 : 10;
}

/**
 * 抽出結果を帳票フォームの明細（DocumentItem[]）に正規化する純関数。
 *
 * - unit_price / amount は、片方が欠けていても数量から相互補完する。
 * - 数量が 0/未満/NaN の行は 1 に寄せる（0除算・負数を防ぐ）。
 * - 品名が空の行は捨てる（帳票に空行を作らない）。
 * 値は下書きで、確定前に人が編集する前提。
 */
export function toDocumentItems(extract: InvoiceExtract): DocumentItem[] {
  const out: DocumentItem[] = [];
  for (const line of extract.lines) {
    const description = (line.description ?? "").trim();
    if (!description) continue;

    let quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;

    const rawUnit = line.unit_price_jpy;
    const rawAmount = line.amount_jpy;
    let unitPrice = Number.isFinite(rawUnit as number) ? (rawUnit as number) : NaN;
    let amount = Number.isFinite(rawAmount as number) ? (rawAmount as number) : NaN;

    if (!Number.isFinite(unitPrice) && Number.isFinite(amount)) unitPrice = amount / quantity;
    if (!Number.isFinite(amount) && Number.isFinite(unitPrice)) amount = unitPrice * quantity;
    if (!Number.isFinite(unitPrice)) unitPrice = 0;
    if (!Number.isFinite(amount)) amount = unitPrice * quantity;

    out.push({
      item_type: "item",
      item_code: line.item_code?.trim() || null,
      description,
      quantity,
      unit_price: Math.round(unitPrice),
      amount: Math.round(amount),
      tax_category: normalizeTaxCategory(line.tax_category),
    });
  }
  return out;
}
