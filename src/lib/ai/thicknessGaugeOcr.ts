/**
 * 膜厚計 OCR（AI Vision）— 膜厚計の表示や手書き測定シートの写真から、
 * 部位別の施工前後 μm を構造化抽出する。証明書フォームの手打ちを減らすための入力。
 *
 * 精度方針は identityOcr と同じ: まず Sonnet で読み取り、自己評価 confidence が
 * しきい値を下回った難ケースだけ Opus へ昇格する（μm の数字読み取りは精度が要るため
 * プランで Haiku には落とさない）。失敗時は fail-open で空配列を返し、手打ちを妨げない。
 *
 * 抽出結果はそのまま確定せず、FilmThicknessSection の編集可能な行として差し込む
 * （人が確認して発行する — docs/field-workflow-roadmap.md のガードに従う）。
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_VISION, AI_MODEL_CRITICAL, AI_ESCALATE_THRESHOLD } from "@/lib/ai/client";
import { THICKNESS_LOCATION_PRESETS } from "@/lib/certificates/thicknessPanels";

export type ThicknessImageMediaType = "image/jpeg" | "image/png" | "image/webp";

const ThicknessReadingSchema = z.object({
  location: z.string().describe("部位名（日本語）。可能なら標準部位名に正規化する"),
  before_um: z.number().nullable().describe("施工前の膜厚 μm。読めない・記載が無ければ null"),
  after_um: z.number().nullable().describe("施工後の膜厚 μm。読めない・記載が無ければ null"),
  notes: z.string().describe("備考。無ければ空文字"),
});

const ThicknessOcrSchema = z.object({
  readings: z.array(ThicknessReadingSchema),
  confidence: z.number().min(0).max(1).describe("読み取り全体の自己評価信頼度 0..1"),
});

export type ThicknessOcrResult = z.infer<typeof ThicknessOcrSchema>;

const EMPTY: ThicknessOcrResult = { readings: [], confidence: 0 };

const SYSTEM_PROMPT = `あなたは自動車の塗装・コーティング施工店で使う膜厚計 OCR アシスタントです。
膜厚計の表示画面、または手書きの膜厚測定シートの写真から、部位ごとの膜厚(μm)を抽出してください。

- 部位名(location)は日本語で、可能な限り次の標準部位名のいずれかに正規化してください:
  ${THICKNESS_LOCATION_PRESETS.join(" / ")}
  一致する標準部位が無ければ、読み取れた部位名をそのまま返してください。
- 施工前(before_um)・施工後(after_um)の数値を μm 単位で読み取ってください。片方しか無い場合は他方を null に。
- 数字が読み取れない項目は null にしてください。推測で値を作らないこと。
- confidence は画像の鮮明さと読み取り自信度を 0..1 で自己評価してください。`;

async function runPass(
  base64: string,
  mediaType: ThicknessImageMediaType,
  model: string,
): Promise<ThicknessOcrResult | null> {
  const client = getAnthropicClient();
  const msg = await withRetry("anthropic", () =>
    client.messages.parse({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "この画像から部位別の膜厚(μm)を JSON で抽出してください。" },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ThicknessOcrSchema) },
    }),
  );
  return msg.parsed_output ?? null;
}

/**
 * 膜厚計/測定シート画像から部位別 μm を抽出する。
 * AI 呼び出し失敗やスキーマ不一致は fail-open で空結果を返す（手打ちを妨げない）。
 */
export async function extractThicknessReadings(
  base64: string,
  mediaType: ThicknessImageMediaType,
): Promise<ThicknessOcrResult> {
  try {
    let parsed = await runPass(base64, mediaType, AI_MODEL_VISION);
    if (parsed && AI_MODEL_CRITICAL !== AI_MODEL_VISION && parsed.confidence < AI_ESCALATE_THRESHOLD) {
      // 難ケースだけベストエフォートで昇格。劣化したら一次結果を維持。
      try {
        const escalated = await runPass(base64, mediaType, AI_MODEL_CRITICAL);
        if (escalated && escalated.confidence >= parsed.confidence) parsed = escalated;
      } catch (e) {
        console.error("[thicknessGaugeOcr] escalation failed, keeping first pass:", e);
      }
    }
    return parsed ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
