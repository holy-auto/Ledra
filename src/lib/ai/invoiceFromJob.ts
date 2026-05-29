/**
 * 案件 (reservation) → 請求書下書き生成。
 *
 * 既存の `/api/admin/invoices` POST が受け取る payload と同じ形に揃え、
 * クライアント側のフォームに流し込むだけで保存できる構造で返す。
 *
 * - items[]: メニュー (`menu_items_json`) を 1 行 = 1 行として展開、空なら
 *   estimated_amount を 1 行に集約する deterministic フォールバック
 * - tax_rate: メニューに `tax_rate` が混在していれば AI で判定、なければ 10 を採用
 * - recipient_name: 顧客名 + 「様」 (法人なら "御中") を Haiku に判定させる
 * - note: メニュー要約 + 車両情報を「請求書備考」として 1〜2 行で
 *
 * 失敗時は deterministic だけで完結したフォールバック payload を返す。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface InvoiceFromJobInput {
  customerName?: string | null;
  customerType?: "individual" | "corporate" | null;
  vehicle?: { maker?: string | null; model?: string | null; plate_display?: string | null } | null;
  menuItems: Array<{ name: string; unit_price?: number | null; quantity?: number | null }>;
  estimatedAmount?: number | null;
  serviceCategory?: string | null;
}

export interface InvoiceDraftItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate?: number;
}

export interface InvoiceFromJobResult {
  items: InvoiceDraftItem[];
  tax_rate: number;
  recipient_name: string;
  note: string;
  confidence: number;
  ai: boolean;
}

const InvoiceDraftSchema = z.object({
  recipient_name: z.string().max(200),
  note: z.string().max(400),
  confidence: z.number().min(0).max(1),
});

export function buildDeterministicInvoiceDraft(input: InvoiceFromJobInput): InvoiceFromJobResult {
  const items: InvoiceDraftItem[] = [];
  if (input.menuItems.length > 0) {
    for (const m of input.menuItems) {
      const qty = Number.isFinite(m.quantity ?? NaN) ? Number(m.quantity) : 1;
      const price = Number.isFinite(m.unit_price ?? NaN) ? Number(m.unit_price) : 0;
      items.push({
        description: m.name,
        quantity: qty > 0 ? qty : 1,
        unit: "式",
        unit_price: price > 0 ? price : 0,
      });
    }
  } else if (input.estimatedAmount && input.estimatedAmount > 0) {
    items.push({
      description: input.serviceCategory ? `${input.serviceCategory} 一式` : "施工費",
      quantity: 1,
      unit: "式",
      unit_price: Math.round(input.estimatedAmount),
    });
  }

  const recipient = buildRecipientName(input.customerName, input.customerType);
  const note = buildNote(input.vehicle);
  return { items, tax_rate: 10, recipient_name: recipient, note, confidence: 0.6, ai: false };
}

export async function generateInvoiceFromJob(input: InvoiceFromJobInput): Promise<InvoiceFromJobResult> {
  const baseline = buildDeterministicInvoiceDraft(input);
  if (!process.env.ANTHROPIC_API_KEY) return baseline;
  if (baseline.items.length === 0) return baseline;

  const client = getAnthropicClient();
  const facts: string[] = [];
  if (input.customerName) facts.push(`顧客名: ${input.customerName}`);
  if (input.customerType) facts.push(`顧客区分: ${input.customerType}`);
  if (input.vehicle) {
    facts.push(
      `車両: ${[input.vehicle.maker, input.vehicle.model, input.vehicle.plate_display]
        .filter(Boolean)
        .join(" / ")}`,
    );
  }
  facts.push(`明細: ${baseline.items.map((i) => `${i.description} ¥${i.unit_price} × ${i.quantity}`).join(", ")}`);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 384,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n") }],
        output_config: { format: zodOutputFormat(InvoiceDraftSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return baseline;
    return {
      ...baseline,
      recipient_name: parsed.recipient_name || baseline.recipient_name,
      note: parsed.note || baseline.note,
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[invoiceFromJob] generation failed:", err);
    return baseline;
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店の事務担当を支援するアシスタントです。
請求書の「宛名」と「備考」を 1 つずつ生成してください。

宛名:
- 個人なら "山田 太郎 様" のように「様」付与
- 法人なら「御中」、屋号が分かれば前置
- 不明時は顧客名そのまま

備考:
- 車両情報があれば "対象車両: <maker model plate>" を含める
- 1〜2 行 (改行不可)。絵文字禁止
- 過剰なお礼や「ご利用ありがとうございます」は不要

confidence は 0.0〜1.0 で自己評価。`.trim();

function buildRecipientName(name: string | null | undefined, type: "individual" | "corporate" | null | undefined): string {
  if (!name) return "";
  if (type === "corporate") return `${name} 御中`;
  return `${name} 様`;
}

function buildNote(vehicle: InvoiceFromJobInput["vehicle"]): string {
  if (!vehicle) return "";
  const parts = [vehicle.maker, vehicle.model, vehicle.plate_display].filter(Boolean);
  if (parts.length === 0) return "";
  return `対象車両: ${parts.join(" ")}`;
}
