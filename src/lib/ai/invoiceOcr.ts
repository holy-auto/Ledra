/**
 * 書類OCR（AI Vision）— 仕入先請求書 / 外注請求書に加え、取引先ごとに様式がバラバラな
 * 発注書・作業依頼書・商談メモ（付属品明細）の写真から明細を構造化抽出し、
 * 帳票フォーム（documents）の見積書・納品書・請求書の下書きに流し込む。
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
  supplier_name: z.string().nullable().describe("書類の発行元（請求元・発注元）の会社名／店舗・拠点名"),
  invoice_number: z.string().nullable().describe("書類番号（請求書番号・注文番号・商談No 等）。無ければ null"),
  issue_date: z.string().nullable().describe("発行日（商談日・発注日）ISO。読めなければ null"),
  due_date: z.string().nullable().describe("支払期日 ISO。読めなければ null"),
  subtotal_jpy: z.number().nullable().describe("小計。無ければ null"),
  tax_jpy: z.number().nullable().describe("消費税額。無ければ null"),
  total_jpy: z.number().nullable().describe("合計欄の金額。無ければ null"),
  lines: z.array(InvoiceLineSchema),
  // 以下は発注書・依頼書・商談メモ向け。請求書では通常 null / 空。
  order_numbers: z.array(z.string()).describe("書類番号以外の管理番号（例: 'オーダーNo 88561'）。ラベル付きで"),
  end_customer_name: z.string().nullable().describe("エンドユーザー（お客様名）。無ければ null"),
  sales_rep: z.string().nullable().describe("発注元の担当者名。無ければ null"),
  vehicle_model: z.string().nullable().describe("車種。無ければ null"),
  vehicle_color: z.string().nullable().describe("車体色。無ければ null"),
  vehicle_chassis_no: z.string().nullable().describe("車台番号（F-NO 等）。無ければ null"),
  delivery_date: z
    .string()
    .nullable()
    .describe("納車予定日・納期 ISO。年が無ければ発行日の年で補う。読めなければ null"),
  handwritten_notes: z
    .array(z.string())
    .describe("手書き・余白の指示や追記（例: '12Vお願いします'）。1件ずつ原文どおり"),
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
  order_numbers: [],
  end_customer_name: null,
  sales_rep: null,
  vehicle_model: null,
  vehicle_color: null,
  vehicle_chassis_no: null,
  delivery_date: null,
  handwritten_notes: [],
};

/** 書類画像から明細を抽出する。失敗時は fail-open で空明細を返す。 */
export async function extractInvoice(base64: string, mediaType: ImageMediaType): Promise<InvoiceExtract> {
  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_VISION,
        max_tokens: 2048,
        system: `あなたは自動車整備・用品取付店に届く書類を読み取る OCR アシスタントです。
書類は仕入先請求書・外注請求書のほか、ディーラー等の取引先が独自様式で出す
発注書・作業依頼書・商談メモ（付属品明細）など様々です。写真から以下を正確に抽出し、JSON で返してください。
- 発行元（supplier_name）: 請求元または発注元の会社名・店舗/拠点名
- 書類番号（invoice_number）とその他の管理番号（order_numbers、ラベル付き）
- 発行日（issue_date）/ 支払期日（due_date）/ 納車予定日・納期（delivery_date）
- 小計 / 消費税額 / 合計（合計欄に印字された金額をそのまま total_jpy に）
- 明細行：品名・品番・数量・単価・金額・税率(10 or 8)を1行ずつ。値引き行は負の金額で。0円の行も省略しない
- お客様名（end_customer_name）・担当者（sales_rep）・車種・色・車台番号（F-NO 等）
- 手書きの指示・追記（handwritten_notes）: 印字明細以外の書き込みを1件ずつ原文どおり
読み取れない項目は null（配列は空）にしてください。推測で値を作らないこと。`,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "この書類の明細と金額を JSON で抽出してください。" },
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

/**
 * 明細合計が合計欄と一致し、消費税欄が「合計の 10/110」（内税）なら true。
 * 商談メモ等は税込価格を並べて内税の消費税を添える様式が多く、税抜扱いで
 * 取り込むと 10% 二重課税になるため、AI の自己申告ではなく金額の整合で判定する。
 * 判定できない（合計・税額が無い、どちらとも合わない）ときは null。
 */
export function detectTaxInclusive(extract: InvoiceExtract): boolean | null {
  const total = extract.total_jpy ?? extract.subtotal_jpy;
  const tax = extract.tax_jpy;
  if (total == null || tax == null || total <= 0) return null;
  const lineSum = extract.lines.reduce((s, l) => s + (l.amount_jpy ?? 0), 0);
  if (lineSum !== total) return null;
  // 端数処理（切捨・四捨五入・切上）の差を 1 円まで許容
  if (Math.abs(tax - (total * 10) / 110) <= 1) return true;
  if (Math.abs(tax - total * 0.1) <= 1) return false;
  return null;
}

export interface OcrDraftHeader {
  /** 件名の下書き（お客様名＋車種）。材料が無ければ null。 */
  subject: string | null;
  /** 備考の下書き（発行元・管理番号・車両・手書き指示）。材料が無ければ null。 */
  note: string | null;
  is_tax_inclusive: boolean | null;
}

/** 発注書・依頼書のヘッダ情報を、帳票フォームの件名・備考に載せる下書きへ整形する純関数。 */
export function toDraftHeader(extract: InvoiceExtract): OcrDraftHeader {
  const vehicle = [extract.vehicle_model, extract.vehicle_chassis_no && `（${extract.vehicle_chassis_no}）`]
    .filter(Boolean)
    .join("");
  const subject =
    [extract.end_customer_name && `${extract.end_customer_name} 様`, vehicle].filter(Boolean).join(" ") || null;

  const numbers = [extract.invoice_number && `書類No ${extract.invoice_number}`, ...extract.order_numbers].filter(
    Boolean,
  );
  const noteLines = [
    extract.supplier_name &&
      `発行元: ${extract.supplier_name}${extract.sales_rep ? `（担当: ${extract.sales_rep}）` : ""}`,
    numbers.length > 0 && `管理番号: ${numbers.join(" / ")}`,
    (vehicle || extract.vehicle_color) && `車両: ${[vehicle, extract.vehicle_color].filter(Boolean).join(" / ")}`,
    extract.delivery_date && `納車予定: ${extract.delivery_date}`,
    ...extract.handwritten_notes.map((n) => `※ ${n}`),
  ].filter(Boolean);

  return {
    subject,
    note: noteLines.length > 0 ? noteLines.join("\n") : null,
    is_tax_inclusive: detectTaxInclusive(extract),
  };
}
