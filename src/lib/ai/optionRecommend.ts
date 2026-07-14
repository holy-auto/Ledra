/**
 * 見積りOK後のオプション/アドオン提案 (Phase 2)。
 *
 * 設計書 §5: 回答ソースは既存メニュー (`menu_items`) を優先し、無ければ過去請求実績。
 * ナレッジ同様「勝手に作らない」制約 — 登録メニューが 1 件でもあるときは、AI の
 * 提案を渡した候補の `id` に厳密一致するものだけに絞り込み、無いものは捨てる
 * (hallucination で存在しない商品を提案しない)。登録メニューが無いときだけ、
 * 過去請求実績からの自由記述フォールバックを許す (quoteFromVehicle.ts と同じ限界)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import type { PastInvoiceLine } from "@/lib/ai/quoteFromVehicle";

export interface OptionMenuCandidate {
  id: string;
  name: string;
  unit_price: number;
  category_large: string | null;
}

export interface OptionRecommendInput {
  vehicle: { maker?: string | null; model?: string | null; size_class?: string | null };
  serviceCategory: string;
  /** テナントの登録メニューから、施工内容に近いカテゴリで絞り込んだ候補。 */
  menuCandidates: OptionMenuCandidate[];
  /** 同テナント / 同カテゴリの直近請求書 (登録メニューが無いときのフォールバック元)。 */
  pastInvoices: Array<{ items: PastInvoiceLine[]; total: number }>;
}

export interface RecommendedOption {
  /** 登録メニュー由来なら menu_items.id。過去請求実績フォールバックのみ null。 */
  menuItemId: string | null;
  name: string;
  price: number;
  reason: string;
}

export interface OptionRecommendResult {
  options: RecommendedOption[];
  ai: boolean;
}

const MAX_OPTIONS = 3;

const OptionAiSchema = z.object({
  options: z
    .array(
      z.object({
        menu_item_id: z.string().nullable(),
        name: z.string(),
        price: z.number().int().min(0),
        reason: z.string().max(80),
      }),
    )
    .max(MAX_OPTIONS),
});

/** 過去請求実績の明細を頻度順に集計し上位を返す (quoteFromVehicle.ts の fallback と同じ考え方)。 */
function tallyByFrequency(
  invoices: Array<{ items: PastInvoiceLine[] }>,
  limit: number,
): Array<{ description: string; avgPrice: number }> {
  const tally = new Map<string, { totalPrice: number; count: number }>();
  for (const inv of invoices) {
    for (const line of inv.items) {
      const cur = tally.get(line.description) ?? { totalPrice: 0, count: 0 };
      cur.totalPrice += line.unit_price;
      cur.count += 1;
      tally.set(line.description, cur);
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([description, agg]) => ({ description, avgPrice: Math.round(agg.totalPrice / agg.count) }));
}

/** deterministic フォールバック: 登録メニューがあればそこから、無ければ過去実績頻度から。 */
export function buildDeterministicOptions(input: OptionRecommendInput): OptionRecommendResult {
  if (input.menuCandidates.length > 0) {
    // 過去請求書での登場頻度で並べ替え (人気の高いオプションを優先)。実績が無い品目は末尾。
    const freq = new Map(
      tallyByFrequency(input.pastInvoices, input.menuCandidates.length).map((t, i) => [
        t.description,
        input.menuCandidates.length - i,
      ]),
    );
    const ranked = [...input.menuCandidates].sort((a, b) => (freq.get(b.name) ?? 0) - (freq.get(a.name) ?? 0));
    return {
      options: ranked.slice(0, MAX_OPTIONS).map((m) => ({
        menuItemId: m.id,
        name: m.name,
        price: m.unit_price,
        reason: "登録メニューからのおすすめ",
      })),
      ai: false,
    };
  }
  const top = tallyByFrequency(input.pastInvoices, MAX_OPTIONS);
  return {
    options: top.map((t) => ({
      menuItemId: null,
      name: t.description,
      price: t.avgPrice,
      reason: "過去のご利用実績から",
    })),
    ai: false,
  };
}

export async function generateOptionRecommendations(
  input: OptionRecommendInput,
  opts?: { model?: string },
): Promise<OptionRecommendResult> {
  const baseline = buildDeterministicOptions(input);
  if (!process.env.ANTHROPIC_API_KEY) return baseline;
  if (input.menuCandidates.length === 0 && input.pastInvoices.length === 0) return baseline;

  const client = getAnthropicClient();
  const facts: string[] = [
    `カテゴリ: ${input.serviceCategory}`,
    `車両: ${[input.vehicle.maker, input.vehicle.model, input.vehicle.size_class].filter(Boolean).join(" ")}`,
  ];
  if (input.menuCandidates.length > 0) {
    facts.push(
      `登録メニュー候補 (この中からのみ選ぶこと。id を正確に引用):\n` +
        input.menuCandidates.map((m) => `  id=${m.id} ${m.name} ¥${m.unit_price}`).join("\n"),
    );
  } else {
    facts.push(
      `登録メニューは無いため、過去類似請求書の傾向からのみ提案してください (menu_item_id は null):\n` +
        input.pastInvoices
          .slice(0, 5)
          .map((inv, i) => `  事例${i + 1}: ${inv.items.map((l) => `${l.description} ¥${l.unit_price}`).join(" / ")}`)
          .join("\n"),
    );
  }

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(OptionAiSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed || parsed.options.length === 0) return baseline;

    const candidateById = new Map(input.menuCandidates.map((m) => [m.id, m]));
    const options: RecommendedOption[] = parsed.options
      .map((o) => {
        // 登録メニューがあるときは id が実在する候補のものだけを通す (勝手に作らない)。
        // 名前・価格は AI の言い直しではなく、必ず候補の値をそのまま採用する — AI の
        // 出力をそのまま信じると、id は本物でも金額だけ間違って言い換えられる
        // (hallucination / 丸め) 余地が残ってしまうため。
        if (input.menuCandidates.length > 0) {
          if (o.menu_item_id == null) return null;
          const canonical = candidateById.get(o.menu_item_id);
          if (!canonical) return null;
          return { menuItemId: canonical.id, name: canonical.name, price: canonical.unit_price, reason: o.reason };
        }
        return { menuItemId: null, name: o.name, price: o.price, reason: o.reason };
      })
      .filter((o): o is RecommendedOption => o !== null);
    if (options.length === 0) return baseline;
    return { options: options.slice(0, MAX_OPTIONS), ai: true };
  } catch (err) {
    console.error("[optionRecommend] generation failed:", err);
    return baseline;
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店のアップセル提案を支援するアシスタントです。
確定した基本の見積りに対し、追加で提案できるオプション施工を 1〜3 件、価格と一言理由つきで挙げてください。

ルール:
- 登録メニュー候補が渡されたときは、その中からのみ選ぶこと。id は候補にあるものを正確に引用する (新しい商品名や価格を作らない)。
- 登録メニューが無いときのみ、過去請求実績の傾向から一般的な追加施工を提案してよい (この場合 menu_item_id は null)。
- 基本の見積りと重複する内容や、明らかに不要な高額オプションは提案しない。
- reason は 1 行 (例: "コーティングと同時施工で作業時間を短縮できます")。
- 提案が無い/自信が無い場合は空配列で構いません。`.trim();
