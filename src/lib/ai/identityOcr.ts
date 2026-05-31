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
import { getAnthropicClient, AI_MODEL_VISION, cacheableSystem } from "@/lib/ai/client";
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

/**
 * Vision OCR を実行し、PII フィルタを通した結果を返す.
 *
 * 失敗時 (Vision 例外 / スキーマ不一致) は throw する.
 * 呼び出し側 route で `apiInternalError` 等に変換すること.
 */
export async function runIdentityOcr(input: IdentityOcrInput): Promise<IdentityOcrOutput> {
  const client = getAnthropicClient();
  const userHint = input.expected
    ? `想定書類タイプ: ${input.expected} (確証がない場合は doc_type を変更してください)`
    : "想定書類タイプ: 不明 (画像から判定してください)";

  const msg = await withRetry("anthropic", () =>
    client.messages.parse({
      model: AI_MODEL_VISION,
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

  const parsed = msg.parsed_output;
  if (!parsed) {
    throw new Error("identityOcr: Vision response did not match OcrResultSchema");
  }

  const { sanitized, status } = sanitizeOcrResult(parsed);
  return { result: sanitized, status };
}
