/**
 * マーケット車両の説明文 + 特徴タグ自動生成。
 *
 * 入力: メーカー / 車種 / 年式 / 走行距離 / 主要装備 + 任意で写真 URL 1〜3 枚
 * 出力: 200〜300 字の物件説明文 + 5〜10 個の特徴タグ
 *
 * 写真ありの場合は Vision (Sonnet) を使用、なしの場合はテキストのみ Haiku。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST, AI_MODEL_VISION, cacheableSystem } from "@/lib/ai/client";
import { partitionImageFetchUrls } from "@/lib/security/urlAllowlist";

export interface MarketVehicleInput {
  maker?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  mileage_km?: number | null;
  /** 任意で装備リスト (純正ナビ / サンルーフ / 1 オーナー等) */
  features?: string[];
  /** 任意で写真 URL を 1〜3 枚 (公開アクセス可能なもの) */
  photo_urls?: string[];
  /** 出品の意図 / 強調したい点 (出品者からのメモ) */
  sellerNotes?: string | null;
}

const ResultSchema = z.object({
  description: z.string().min(50).max(600),
  features: z.array(z.string().max(40)).min(1).max(15),
  confidence: z.number().min(0).max(1),
});

export interface MarketVehicleDescriptionResult {
  description: string;
  features: string[];
  confidence: number;
  ai: boolean;
}

const SYSTEM_PROMPT_TEXT = `あなたは中古車マーケットの商品説明を書くプロのコピーライターです。
入力情報から、購入検討者の心に響く 200〜300 字の説明文と、買い手が検索に使いそうな
5〜10 個の特徴タグを返してください。

ルール:
- 誇張禁止 (情報から確証できない事実は書かない)
- 「希少」「絶対」「断然」のような強すぎる語は避ける
- 価格には触れない (別 UI で表示)
- features は短いキーワード (例: "ワンオーナー", "禁煙車", "純正ナビ")
- 改行 / 絵文字禁止
- confidence は 0.0〜1.0`.trim();

const SYSTEM_PROMPT_VISION = `${SYSTEM_PROMPT_TEXT}

加えて、写真から読み取れる以下を反映させてください:
- ボディの色味 / 内装の素材感
- 目視できる装備 (アルミホイール、ルーフボックス等)
写真から確証できない情報を入力欄に基づき作文するのは OK、写真の存在しない要素を
「写真から〜が見える」と書くのは禁止。`.trim();

export async function generateMarketVehicleDescription(
  input: MarketVehicleInput,
  opts?: { model?: string },
): Promise<MarketVehicleDescriptionResult> {
  const fallback: MarketVehicleDescriptionResult = {
    description: buildFallbackDescription(input),
    features: input.features?.slice(0, 8) ?? [],
    confidence: 0.2,
    ai: false,
  };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const client = getAnthropicClient();
  const facts = [
    `メーカー: ${input.maker ?? "(不明)"}`,
    `車種: ${input.model ?? "(不明)"}`,
    `年式: ${input.year ?? "(不明)"}`,
    `色: ${input.color ?? "(不明)"}`,
    `走行距離: ${input.mileage_km != null ? `${input.mileage_km.toLocaleString("ja-JP")} km` : "(不明)"}`,
    input.features?.length ? `装備: ${input.features.join(", ")}` : null,
    input.sellerNotes ? `出品者メモ: ${input.sellerNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // SSRF ガード: Vision API に渡す画像 URL は許可ホストのみ (内部アドレスへの
  // 代理取得・コスト消費を防ぐ)。許可外はベストエフォートで除外する。
  const safePhotoUrls = input.photo_urls ? partitionImageFetchUrls(input.photo_urls).allowed : [];
  const hasPhotos = safePhotoUrls.length > 0;

  try {
    if (hasPhotos) {
      const imageContents: Array<
        { type: "image"; source: { type: "url"; url: string } } | { type: "text"; text: string }
      > = safePhotoUrls.slice(0, 3).map((url) => ({
        type: "image" as const,
        source: { type: "url" as const, url },
      }));
      imageContents.push({ type: "text", text: facts });

      const msg = await withRetry("anthropic", () =>
        client.messages.parse({
          model: opts?.model ?? AI_MODEL_VISION,
          max_tokens: 768,
          system: cacheableSystem(SYSTEM_PROMPT_VISION),
          messages: [{ role: "user", content: imageContents }],
          output_config: { format: zodOutputFormat(ResultSchema) },
        }),
      );
      const parsed = msg.parsed_output;
      if (!parsed) return fallback;
      return {
        description: parsed.description,
        features: parsed.features,
        confidence: parsed.confidence,
        ai: true,
      };
    }

    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 768,
        system: cacheableSystem(SYSTEM_PROMPT_TEXT),
        messages: [{ role: "user", content: facts }],
        output_config: { format: zodOutputFormat(ResultSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return fallback;
    return {
      description: parsed.description,
      features: parsed.features,
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[marketVehicleDescription] failed:", err);
    return fallback;
  }
}

function buildFallbackDescription(input: MarketVehicleInput): string {
  const parts: string[] = [];
  if (input.year) parts.push(`${input.year} 年式`);
  if (input.maker) parts.push(input.maker);
  if (input.model) parts.push(input.model);
  if (input.color) parts.push(`カラー: ${input.color}`);
  if (input.mileage_km != null) parts.push(`走行距離 ${input.mileage_km.toLocaleString("ja-JP")} km`);
  if (input.features?.length) parts.push(`装備: ${input.features.join(", ")}`);
  return parts.join(" / ") || "(車両情報を入力してください)";
}
