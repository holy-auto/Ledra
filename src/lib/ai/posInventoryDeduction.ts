/**
 * POS チェックアウト → 在庫自動引落 (推定)。
 *
 * 売れた menu_item ごとに「想定消費 SKU と数量」を返す。マッピングは原則
 * `menu_item_inventory_links` の deterministic データから引くが、未登録の
 * メニューがある場合は同カテゴリの過去消費から AI 推定する。
 *
 * 結果はそのまま `inventory_movements` に "type=consume" として書ける形。
 * 戻り値の confidence が低い行は UI で「確認してから引落」させる想定。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface SkuRef {
  id: string;
  name: string;
  category?: string | null;
  /** 在庫単位 (ml / g / 枚 / 個 など) */
  unit?: string | null;
}

export interface MenuSale {
  menu_item_id: string;
  menu_item_name: string;
  service_category?: string | null;
  /** 売れた数 (1 件の施工で数 N 個ぶん消費する想定) */
  sold_quantity: number;
}

export interface DeductionLinkRow {
  menu_item_id: string;
  sku_id: string;
  /** 1 件の menu 消化につき消費される SKU 数量 */
  quantity: number;
}

export interface PastDeductionRow {
  service_category: string | null;
  sku_id: string;
  /** 過去の平均消費 (menu 1 件あたり) */
  avg_quantity: number;
}

export interface DeductionSuggestion {
  menu_item_id: string;
  sku_id: string;
  sku_name: string;
  quantity: number;
  confidence: number;
  method: "link" | "history" | "ai" | "skipped";
  reason: string;
}

const AiSchema = z.object({
  suggestions: z
    .array(
      z.object({
        menu_item_id: z.string(),
        sku_id: z.string(),
        quantity: z.number().min(0).max(10000),
        reason: z.string().max(140),
      }),
    )
    .max(50),
  confidence: z.number().min(0).max(1),
});

export interface DeductionResult {
  suggestions: DeductionSuggestion[];
  ai: boolean;
}

export async function suggestPosDeductions(input: {
  sales: MenuSale[];
  skus: SkuRef[];
  links: DeductionLinkRow[];
  history: PastDeductionRow[];
}): Promise<DeductionResult> {
  const skuById = new Map(input.skus.map((s) => [s.id, s]));
  const linksByMenu = new Map<string, DeductionLinkRow[]>();
  for (const link of input.links) {
    const arr = linksByMenu.get(link.menu_item_id) ?? [];
    arr.push(link);
    linksByMenu.set(link.menu_item_id, arr);
  }
  const historyByCategory = new Map<string, PastDeductionRow[]>();
  for (const h of input.history) {
    if (!h.service_category) continue;
    const arr = historyByCategory.get(h.service_category) ?? [];
    arr.push(h);
    historyByCategory.set(h.service_category, arr);
  }

  const suggestions: DeductionSuggestion[] = [];
  const unresolved: MenuSale[] = [];

  for (const sale of input.sales) {
    const links = linksByMenu.get(sale.menu_item_id);
    if (links && links.length > 0) {
      for (const link of links) {
        const sku = skuById.get(link.sku_id);
        if (!sku) continue;
        suggestions.push({
          menu_item_id: sale.menu_item_id,
          sku_id: sku.id,
          sku_name: sku.name,
          quantity: link.quantity * sale.sold_quantity,
          confidence: 1.0,
          method: "link",
          reason: `menu_item_inventory_links 設定値`,
        });
      }
      continue;
    }
    // 履歴ベース
    const histList = sale.service_category ? historyByCategory.get(sale.service_category) ?? [] : [];
    if (histList.length > 0) {
      for (const h of histList) {
        const sku = skuById.get(h.sku_id);
        if (!sku) continue;
        suggestions.push({
          menu_item_id: sale.menu_item_id,
          sku_id: sku.id,
          sku_name: sku.name,
          quantity: Math.round(h.avg_quantity * sale.sold_quantity * 100) / 100,
          confidence: 0.7,
          method: "history",
          reason: `${sale.service_category} の過去平均消費 (${h.avg_quantity})`,
        });
      }
      continue;
    }
    unresolved.push(sale);
  }

  if (unresolved.length === 0 || !process.env.ANTHROPIC_API_KEY) {
    return { suggestions, ai: false };
  }

  // AI で未解決メニューを推定
  const client = getAnthropicClient();
  const skuList = input.skus.slice(0, 50).map((s) => `- id=${s.id} name=${s.name} unit=${s.unit ?? "個"}`).join("\n");
  const saleList = unresolved
    .map((s) => `- menu_item_id=${s.menu_item_id} name=${s.menu_item_name} category=${s.service_category ?? "(不明)"} qty=${s.sold_quantity}`)
    .join("\n");
  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `SKU マスタ:\n${skuList}\n\n紐付け未登録の売上 (これらを SKU 消費に対応付けてください):\n${saleList}`,
          },
        ],
        output_config: { format: zodOutputFormat(AiSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return { suggestions, ai: false };
    for (const s of parsed.suggestions) {
      const sku = skuById.get(s.sku_id);
      if (!sku) continue;
      suggestions.push({
        menu_item_id: s.menu_item_id,
        sku_id: sku.id,
        sku_name: sku.name,
        quantity: s.quantity,
        confidence: parsed.confidence,
        method: "ai",
        reason: s.reason,
      });
    }
    return { suggestions, ai: true };
  } catch (err) {
    console.error("[posInventoryDeduction] failed:", err);
    return { suggestions, ai: false };
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店の在庫管理を支援するアシスタントです。
SKU マスタと、リンク未登録のメニュー売上を見て、各 menu_item がどの SKU を
どれだけ消費したか推定してください。

ルール:
- 与えた sku_id 以外を返さない (新規捏造禁止)
- 自信が無い場合は出力に含めない (空配列を返してよい)
- quantity は menu_item 1 件あたりではなく「売れた数 × 1 件あたり消費」の合計
- reason は 80 字以内、なぜその SKU かを 1 文で
`.trim();
