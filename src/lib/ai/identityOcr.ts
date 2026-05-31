/**
 * 身分証 OCR (自動入力補助).
 *
 * Anthropic Sonnet 4.6 Vision を呼び、運転免許証 / マイナンバーカード(顔写真面) /
 * 在留カード / パスポート / 健康保険証 から「氏名・生年月日・住所・性別・有効期限」
 * のみを抽出する.
 *
 * ★ 本人確認(KYC) ではない ★
 * - 結果は DB に永続化しない (route 側で SELECT/INSERT しない)
 * - フォームへの初期値投入のみが用途
 * - 個人番号(マイナンバー) / 本籍 / 保険者番号 は絶対に出力させない
 *
 * 後段の `src/lib/identity/ocrFilter.ts#sanitizeOcrResult` を必ず通すこと.
 * プロンプトが破られた場合のフェイルセーフ.
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
import { OcrResultSchema, type OcrResult } from "@/lib/identity/ocrSchema";
import { sanitizeOcrResult } from "@/lib/identity/ocrFilter";

const SYSTEM_PROMPT = `あなたは日本の身分証から「フォーム自動入力」のために必要な情報だけを抽出する OCR アシスタントです。
これは本人確認(KYC)ではありません。ユーザがあとで内容を確認・修正します。

【絶対に出力してはいけない情報】
- マイナンバー(12 桁の個人番号). 4-4-4 のハイフン区切りも含む.
- 運転免許証の「本籍」欄.
- 健康保険証の「保険者番号 / 記号番号 / 被保険者番号 / 枝番」.
- パスポート番号の完全な値 (末尾 4 桁のみは可).
- 顔写真の特徴(髪型・表情など).
- 身長・指紋・血液型などの身体情報.

これらが画像に含まれていても出力に含めず、rejected_reasons にその旨を簡潔に記録してください。

【マイナンバーカード裏面(個人番号が大きく印字された面)が送られてきた場合】
- 全フィールドを空のまま返す
- rejected_reasons に "マイナンバー裏面は処理対象外" を入れる
- doc_type = "mynumber_card_front" にはしない (誤検知防止のため "unknown" を返す)

【取得していい情報】
- 氏名 (漢字)
- 氏名カナ (記載があれば)
- 生年月日 (YYYY-MM-DD)
- 住所 (番地まで)
- 性別 (male / female / other)
- 有効期限 (YYYY-MM-DD)
- 郵便番号 (XXX-XXXX または XXXXXXX)

【出力形式】
zod schema に従った JSON のみ. 読み取れない値は省略 (空文字ではなく omit).
confidence は 0.0〜1.0 の自己評価値.`;

export interface IdentityOcrInput {
  /** base64 文字列 (data URI プレフィックスなし) */
  base64: string;
  /** 画像の content-type */
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  /** クライアントが想定する書類タイプ (確認用ヒント; モデルは無視可) */
  expected?: "driver_license" | "mynumber_card_front" | "residence_card" | "passport" | "health_insurance_card";
}

export interface IdentityOcrOutput {
  result: OcrResult;
  /** sanitize で rejected された場合は "rejected" */
  status: "ok" | "rejected";
}

/** 指定モデルで 1 回 OCR を実行する。スキーマ不一致時は null。 */
async function runOcrPass(input: IdentityOcrInput, model: string): Promise<OcrResult | null> {
  const client = getAnthropicClient();
  const userHint = input.expected
    ? `想定書類タイプ: ${input.expected} (確証がない場合は doc_type を変更してください)`
    : "想定書類タイプ: 不明 (画像から判定してください)";

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
              source: {
                type: "base64",
                media_type: input.mediaType,
                data: input.base64,
              },
            },
            {
              type: "text",
              text: `${userHint}\n\nフォーム自動入力に使える情報だけを抽出してください。`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(OcrResultSchema) },
    }),
  );

  return msg.parsed_output ?? null;
}

/**
 * Vision OCR を実行し、PII フィルタを通した結果を返す.
 *
 * 精度方針: まず Sonnet で抽出し、自己評価 (confidence) がしきい値を下回った
 * 「読み取りにくい」ケースだけ最大火力モデル (Opus) へ昇格して精度を底上げする。
 * 大半の鮮明な画像は Sonnet 1 回で完結するので、平均コストは抑えたまま
 * 難ケースの精度だけを引き上げられる (= 効くところにだけ最大火力)。
 *
 * 失敗時 (Vision 例外 / スキーマ不一致) は throw する.
 * 呼び出し側 route で `apiInternalError` 等に変換すること.
 */
export async function runIdentityOcr(input: IdentityOcrInput): Promise<IdentityOcrOutput> {
  let parsed = await runOcrPass(input, AI_MODEL_VISION);

  // rejected_reasons がある = 一次パスで禁止/機微書類 (マイナンバー裏面等) を検出済み。
  // この検出は confidence が低くても優先して保持し、昇格で上書き (取りこぼし) させない。
  if (
    parsed &&
    AI_MODEL_CRITICAL !== AI_MODEL_VISION &&
    parsed.confidence < AI_ESCALATE_THRESHOLD &&
    parsed.rejected_reasons.length === 0
  ) {
    // 昇格はベストエフォート。Opus 側が失敗 (timeout/rate limit/誤設定) しても
    // 一次結果 (parsed) を破棄せず維持する。
    try {
      const escalated = await runOcrPass(input, AI_MODEL_CRITICAL);
      // 昇格結果が同等以上の自己評価なら採用 (劣化したら元の結果を維持)。
      if (escalated && escalated.confidence >= parsed.confidence) {
        parsed = escalated;
      }
    } catch (e) {
      console.error("[identityOcr] escalation failed, keeping first pass:", e);
    }
  }

  if (!parsed) {
    throw new Error("identityOcr: Vision response did not match OcrResultSchema");
  }

  const { sanitized, status } = sanitizeOcrResult(parsed);
  return { result: sanitized, status };
}
