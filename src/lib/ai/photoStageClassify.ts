/**
 * 施工写真の before/after 自動分類（AI Vision）。
 *
 * 未タグ（stage='unspecified'）の施工写真を「施工前 / 施工後 / それ以外」に分類し、
 * 証明書の meta に提案として保存する（改ざん/品質チェックと同じ注釈パターン）。
 * 分類は軽量タスクなので fastModelForPlanTier を使う。確定（stage の書き換え）は
 * 人が UI で行う前提で、ここは提案のみ（発行の before/after ゲートには不介入）。
 *
 * 選定・マッピングは純関数に切り出し、単体テストで担保する。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, cacheableSystem } from "@/lib/ai/client";

/** AI が返す分類ラベル。 */
export const PhotoStageSchema = z.object({
  stage: z.enum(["before", "after", "other"]).describe("施工前=before / 施工後=after / 判別不能・作業中=other"),
  confidence: z.number().min(0).max(1),
});
export type PhotoStageResult = z.infer<typeof PhotoStageSchema>;

/** certificate_images.stage の許容値のうち、分類で提案しうるもの。 */
export type CertStage = "intake_before" | "after";

/** AI ラベル → certificate_images.stage。other/不明は提案しない（null）。 */
export function aiStageToCertStage(stage: PhotoStageResult["stage"]): CertStage | null {
  if (stage === "before") return "intake_before";
  if (stage === "after") return "after";
  return null;
}

export interface StageImageRow {
  id: string;
  stage: string | null;
}

/**
 * 分類対象の画像 ID を選ぶ純関数。
 * - stage が未タグ（'unspecified' か空）の画像のみ対象（人が付けたタグは尊重）。
 * - 既に提案済み（prevSuggestions にキーあり）はスキップ（再課金を避ける）。
 * - 暴走防止に上限 max。
 */
export function pickImagesToClassify(
  rows: StageImageRow[],
  prevSuggestions: Record<string, unknown>,
  max: number,
): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const stage = (r.stage ?? "").trim();
    if (stage && stage !== "unspecified") continue; // 手動タグ済みは触らない
    if (prevSuggestions[r.id] !== undefined) continue; // 提案済み
    out.push(r.id);
    if (out.length >= max) break;
  }
  return out;
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const SYSTEM_PROMPT = `あなたは自動車の施工写真を「施工前」「施工後」に分類するアシスタントです。
1 枚の写真を見て、施工（コーティング/PPF/板金塗装/磨き等）の前か後かを判定してください。
- 汚れ・小傷・くすみ・施工前の素の状態が写っていれば before
- 光沢・仕上がり・保護フィルム貼付後・磨き上げ後など施工完了状態なら after
- 作業途中、部分的、判別が難しい場合は other
confidence は 0.0〜1.0 の自己評価値。zod schema に従った JSON のみを返す。`;

/**
 * 1 枚の写真を before/after/other に分類する。失敗時は fail-open で
 * { stage: "other", confidence: 0 }（提案しない扱い）を返す。
 */
export async function classifyPhotoStage(
  base64: string,
  mediaType: ImageMediaType,
  opts: { model: string },
): Promise<PhotoStageResult> {
  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts.model,
        max_tokens: 256,
        system: cacheableSystem(SYSTEM_PROMPT),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "この施工写真は施工前・施工後のどちらですか。判別できなければ other。" },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(PhotoStageSchema) },
      }),
    );
    return msg.parsed_output ?? { stage: "other", confidence: 0 };
  } catch {
    return { stage: "other", confidence: 0 };
  }
}
