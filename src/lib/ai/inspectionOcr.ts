/**
 * 点検写真 OCR (走行距離メーター / タイヤ残溝).
 *
 * Anthropic Sonnet 4.6 Vision を呼び、点検表フォームへの自動入力に使う数値を抽出する.
 * 身分証 OCR (`src/lib/ai/identityOcr.ts`) と同じ二段構え:
 *   まず Sonnet で読み取り、自己評価 (confidence) がしきい値を下回る「読みにくい」
 *   ケースだけ Opus へ昇格して精度を底上げする (= 効くところにだけ最大火力)。
 *
 * ★ 診断ではない ★
 * - 結果は DB に永続化しない (route 側で SELECT/INSERT しない)
 * - 点検記録フォームへの初期値投入のみが用途。確定 (保存) は人が行う
 * - 読み取れない値は null + warning で返し、数字を創作させない
 *
 * 後段の `normalizeInspectionOcr` を必ず通すこと (妥当範囲外の値を破棄する).
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import {
  getAnthropicClient,
  AI_MODEL_VISION,
  AI_MODEL_CRITICAL,
  AI_ESCALATE_THRESHOLD,
  cacheableSystem,
} from "@/lib/ai/client";
import {
  InspectionOcrResultSchema,
  normalizeInspectionOcr,
  type InspectionOcrResult,
  type InspectionOcrTarget,
} from "@/lib/inspection/inspectionOcrSchema";

const SYSTEM_PROMPT = `あなたは自動車整備の点検写真から「点検表の自動入力」に必要な数値だけを読み取る OCR アシスタントです。
これは診断ではありません。整備士があとで内容を確認・修正します。

【対象が odometer (走行距離メーター) の場合】
- 総走行距離 (積算計 / ODO) を km 単位の整数で mileage_km に入れる。
- トリップメーター (TRIP A/B) や燃費計・時計は無視する。
- マイル (mi) 表示の車両なら km へ換算せず、mi のままの数値は使わず warning に「マイル表示の可能性」を記録し mileage_km は null にする。
- 数字が一部隠れて読めない場合は創作せず mileage_km=null、warning に理由を書く。
- tread_depth_mm / tire_position / slip_sign_exposed は null にする。

【対象が tire (タイヤ) の場合】
- 残溝 (トレッド溝の深さ) を mm で tread_depth_mm に入れる。デプスゲージが写っていればその読みを優先。
- スリップサイン (△マーク位置の露出) が確認できれば slip_sign_exposed を true/false で入れる。判別不能は null。
- 装着位置が画像や文脈から分かれば tire_position に入れる (front_left 等)。不明は "unknown"。
- ひび割れ・偏摩耗・溝内亀裂・釘刺さり等の劣化所見を condition_notes に短い日本語で列挙する。
- 溝が読めない場合は創作せず tread_depth_mm=null、warning に理由を書く。
- mileage_km は null にする。

【共通】
- confidence は 0.0〜1.0 の自己評価値。ブレ・反射・一部欠けがあれば下げる。
- zod schema に従った JSON のみを返す。`;

export interface InspectionOcrInput {
  /** base64 文字列 (data URI プレフィックスなし) */
  base64: string;
  /** 画像の content-type */
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** 読み取り対象 (odometer/tire)。モデルへのヒント兼、正規化の分岐に使う。 */
  target: InspectionOcrTarget;
}

/** 指定モデルで 1 回 OCR を実行する。スキーマ不一致時は null。 */
async function runOcrPass(input: InspectionOcrInput, model: string): Promise<InspectionOcrResult | null> {
  const client = getAnthropicClient();
  const targetHint =
    input.target === "odometer"
      ? "読み取り対象: 走行距離メーター (odometer)。総走行距離を km で。"
      : "読み取り対象: タイヤ (tire)。残溝(mm)・スリップサイン・劣化所見を。";

  const msg = await withRetry("anthropic", () =>
    client.messages.parse({
      model,
      max_tokens: 1024,
      system: cacheableSystem(SYSTEM_PROMPT),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: input.mediaType, data: input.base64 },
            },
            {
              type: "text",
              text: `${targetHint}\n\n点検表の自動入力に使える数値だけを、読み取れた範囲で抽出してください。読めない値は創作せず null にしてください。`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(InspectionOcrResultSchema) },
    }),
  );

  return msg.parsed_output ?? null;
}

/**
 * Vision OCR を実行し、正規化済みの結果を返す。
 *
 * まず Sonnet で読み取り、confidence がしきい値未満のときだけ Opus へ昇格する。
 * 失敗時 (Vision 例外 / スキーマ不一致) は throw する。呼び出し側 route で
 * `apiInternalError` 等へ変換すること。
 */
export async function runInspectionOcr(input: InspectionOcrInput): Promise<InspectionOcrResult> {
  let parsed = await runOcrPass(input, AI_MODEL_VISION);

  if (parsed && AI_MODEL_CRITICAL !== AI_MODEL_VISION && parsed.confidence < AI_ESCALATE_THRESHOLD) {
    // 昇格はベストエフォート。Opus 側が失敗しても一次結果を破棄しない。
    try {
      const escalated = await runOcrPass(input, AI_MODEL_CRITICAL);
      if (escalated && escalated.confidence >= parsed.confidence) {
        parsed = escalated;
      }
    } catch (e) {
      console.error("[inspectionOcr] escalation failed, keeping first pass:", e);
    }
  }

  if (!parsed) {
    throw new Error("inspectionOcr: Vision response did not match InspectionOcrResultSchema");
  }

  // モデルが対象を取り違えても、正規化で入力側の target に強制的に揃える。
  return normalizeInspectionOcr({ ...parsed, target: input.target });
}
