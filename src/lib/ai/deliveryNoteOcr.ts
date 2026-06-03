/**
 * 納品書OCR（AI Vision）— 紙の部品商伝票から明細を構造化抽出する（L3 三方照合の入力）。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L3 / §6.1 evidence.ocr_extracted
 *
 * 部品業界は紙伝票が主流のため、写真1枚から AI で明細を読み取り、
 * threeWayMatch / reconcileQuantity（reconciliation.ts）の入力に正規化する。
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_VISION } from "@/lib/ai/client";
import type { LineItem } from "@/lib/parts/reconciliation";

export const DeliveryNoteLineSchema = z.object({
  label: z.string().describe("品名"),
  code: z.string().nullable().describe("GTIN/JAN または品番。無ければ null"),
  quantity: z.number().describe("数量"),
  unit_price_jpy: z.number().nullable().describe("税込単価（円）。不明なら null"),
  amount_jpy: z.number().nullable().describe("税込金額（円）。不明なら null"),
});

export const DeliveryNoteSchema = z.object({
  supplier_name: z.string().nullable(),
  delivery_date: z.string().nullable().describe("ISO日付。読めなければ null"),
  lines: z.array(DeliveryNoteLineSchema),
});

export type DeliveryNoteExtract = z.infer<typeof DeliveryNoteSchema>;
export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * 納品書画像から明細を抽出する。AI 呼び出し失敗時は fail-open で空明細を返す
 * （三方照合は「納品書欠落」として finding を出すので、抽出失敗が確定を止めることはない）。
 */
export async function extractDeliveryNote(base64: string, mediaType: ImageMediaType): Promise<DeliveryNoteExtract> {
  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_VISION,
        max_tokens: 2048,
        system: `あなたは自動車整備店の納品書を読み取る OCR アシスタントです。
納品書の写真から、品名・品番(GTIN/JAN)・数量・単価・金額を1行ずつ正確に抽出し、JSON で返してください。
読み取れない項目は null にしてください。推測で値を作らないこと。`,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "この納品書の明細を JSON で抽出してください。" },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(DeliveryNoteSchema) },
      }),
    );
    return msg.parsed_output ?? { supplier_name: null, delivery_date: null, lines: [] };
  } catch {
    return { supplier_name: null, delivery_date: null, lines: [] };
  }
}

/**
 * 抽出結果を照合用 LineItem[] に正規化する（純関数）。
 * key は code(GTIN/品番) を優先し、無ければ品名で突合する。
 * 同一 key は数量・金額を合算する。
 */
export function toLineItems(extract: DeliveryNoteExtract): LineItem[] {
  const byKey = new Map<string, LineItem>();
  for (const line of extract.lines) {
    const key = (line.code?.trim() || line.label?.trim() || "").toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    const amount = line.amount_jpy ?? null;
    if (!existing) {
      byKey.set(key, { key, quantity: line.quantity, amountJpy: amount, label: line.label });
    } else {
      existing.quantity += line.quantity;
      if (amount != null) existing.amountJpy = (existing.amountJpy ?? 0) + amount;
    }
  }
  return [...byKey.values()];
}
