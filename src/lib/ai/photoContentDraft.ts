/**
 * 施工写真から「施工内容の下書き」と「サービス種別」を AI Vision で推定する。
 *
 * 未提案の施工写真を 1〜2 枚見て、施工内容の下書き文（≤120字）とサービス種別を生成し、
 * 証明書の meta に提案として保存する（改ざん/品質/ステージ分類と同じ注釈パターン）。
 * 確定（施工内容欄への反映・発行）は必ず人が行う（壁3）。ここは提案のみ。
 *
 * 選定・マッピングは純関数に切り出し、単体テストで担保する。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, cacheableSystem } from "@/lib/ai/client";

/** AI が返す施工内容ドラフト。 */
export const PhotoContentSchema = z.object({
  serviceCategory: z
    .enum(["coating", "ppf", "body_repair", "maintenance", "detailing", "other"])
    .describe("写真から推定される施工種別。判別不能は other。"),
  contentDraft: z.string().max(120).describe("施工内容の下書き（120字以内・日本語・体言止め可）。判別不能なら空文字。"),
  confidence: z.number().min(0).max(1),
});
export type PhotoContentResult = z.infer<typeof PhotoContentSchema>;

export interface ContentImageRow {
  id: string;
  stage: string | null;
}

/**
 * 内容ドラフトの対象画像 ID を選ぶ純関数。
 * - 既に提案済み（prevSuggestions にキーあり）なら何もしない（全体で1度だけ提案・再課金回避）。
 * - after（施工後）を優先し、無ければ先頭から max 枚。代表写真だけでコストを抑える。
 */
export function pickImagesForContentDraft(
  rows: ContentImageRow[],
  prevSuggestions: Record<string, unknown>,
  max: number,
): string[] {
  // 証明書単位で1度でも提案済みなら再実行しない。
  if (prevSuggestions && Object.keys(prevSuggestions).length > 0) return [];
  if (rows.length === 0 || max <= 0) return [];
  const after = rows.filter((r) => (r.stage ?? "") === "after").map((r) => r.id);
  const rest = rows.filter((r) => (r.stage ?? "") !== "after").map((r) => r.id);
  return [...after, ...rest].slice(0, max);
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const SYSTEM_PROMPT = `あなたは自動車の施工写真から「施工内容の下書き」を作るアシスタントです。
渡された施工写真（コーティング/PPF/板金塗装/整備/磨き 等）を見て、
- serviceCategory: 施工種別を coating/ppf/body_repair/maintenance/detailing/other から選ぶ
- contentDraft: 証明書に載せる施工内容の下書きを日本語で120字以内（体言止め可・簡潔に。写真から確実に言えることだけ。推測で装備や数値を作らない）
- confidence: 0.0〜1.0 の自己評価
判別できない場合は serviceCategory=other, contentDraft="" とする。zod schema に従った JSON のみを返す。`;

/**
 * 施工写真（1〜数枚）から施工内容ドラフトを生成する。失敗時は fail-open で
 * { serviceCategory:"other", contentDraft:"", confidence:0 }（提案しない扱い）を返す。
 */
export async function draftPhotoContent(
  images: Array<{ base64: string; mediaType: ImageMediaType }>,
  opts: { model: string },
): Promise<PhotoContentResult> {
  if (images.length === 0) return { serviceCategory: "other", contentDraft: "", confidence: 0 };
  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts.model,
        max_tokens: 512,
        system: cacheableSystem(SYSTEM_PROMPT),
        messages: [
          {
            role: "user",
            content: [
              ...images.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
              })),
              { type: "text" as const, text: "この施工写真から施工種別と施工内容の下書きを作成してください。" },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(PhotoContentSchema) },
      }),
    );
    return msg.parsed_output ?? { serviceCategory: "other", contentDraft: "", confidence: 0 };
  } catch {
    return { serviceCategory: "other", contentDraft: "", confidence: 0 };
  }
}
