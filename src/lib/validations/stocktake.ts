import { z } from "zod";

/**
 * 在庫棚卸 (Inventory Stocktaking) のバリデーションスキーマ。
 *
 * - stocktake_sessions / stocktake_items は menu_items を品目母集団として用いる。
 * - counted_qty は null (未カウント) を許容する。
 */

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

/** 棚卸セッション作成 */
export const stocktakeSessionCreateSchema = z.object({
  name: z.string().trim().min(1, "棚卸名は必須です。").max(200),
  notes: nullableText(1000),
});

/** 棚卸セッション更新 (name / status / notes) */
export const stocktakeSessionUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  name: z.string().trim().min(1, "棚卸名は必須です。").max(200).optional(),
  status: z.enum(["open", "closed"]).optional(),
  notes: nullableText(1000),
});

/** 棚卸明細更新 (実測数 / メモ) */
export const stocktakeItemUpdateSchema = z.object({
  item_id: z.string().uuid("無効なIDです。"),
  // 実測値。null を明示すると未カウントに戻せる。
  counted_qty: z.coerce.number().min(0, "0 以上の数値を入力してください。").max(9_999_999).nullable().optional(),
  notes: nullableText(500),
});
