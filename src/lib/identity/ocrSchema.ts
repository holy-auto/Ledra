/**
 * 身分証 OCR 自動入力 — zod スキーマ.
 *
 * 用途: 顧客フォームの自動入力補助 (本人確認ではない).
 * 対応書類: 運転免許証 / マイナンバーカード(顔写真面) / 在留カード /
 *           パスポート / 健康保険証.
 *
 * セキュリティ方針 (`src/lib/identity/ocrFilter.ts` と一体で運用):
 * - 個人番号(マイナンバー) は絶対に取得しない (番号利用法第9条)
 * - 本籍 / 保険者番号 / 完全なパスポート番号は取得しない (要配慮個人情報)
 * - 結果は DB に永続化しない (フォームへの自動入力のみに使う)
 */
import { z } from "zod";

export const DocTypeSchema = z.enum([
  "driver_license",
  "mynumber_card_front",
  "residence_card",
  "passport",
  "health_insurance_card",
  "unknown",
]);

export type DocType = z.infer<typeof DocTypeSchema>;

const GenderSchema = z.enum(["male", "female", "other"]);

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で出力してください");

const PostalCodeSchema = z.string().regex(/^\d{3}-?\d{4}$/, "郵便番号は 7 桁または 3-4 桁で出力してください");

export const OcrFieldsSchema = z.object({
  name: z.string().optional(),
  name_kana: z.string().optional(),
  birth_date: IsoDateSchema.optional(),
  postal_code: PostalCodeSchema.optional(),
  address: z.string().optional(),
  gender: GenderSchema.optional(),
  expiration_date: IsoDateSchema.optional(),
});

export type OcrFields = z.infer<typeof OcrFieldsSchema>;

export const OcrResultSchema = z.object({
  doc_type: DocTypeSchema,
  confidence: z.number().min(0).max(1),
  fields: OcrFieldsSchema,
  rejected_reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type OcrResult = z.infer<typeof OcrResultSchema>;

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  driver_license: "運転免許証",
  mynumber_card_front: "マイナンバーカード(顔写真面)",
  residence_card: "在留カード",
  passport: "パスポート",
  health_insurance_card: "健康保険証",
  unknown: "判別不能",
};
