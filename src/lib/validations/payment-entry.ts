import { z } from "zod";

/**
 * 入金入力・売掛元帳 (Payment Entry) のバリデーションスキーマ。
 *
 * - payment_entries は documents に対する入金を記録する。
 * - amount は整数 (円)。payment_date は YYYY-MM-DD。
 */

const PAYMENT_METHODS = ["cash", "bank_transfer", "credit_card", "qr", "other"] as const;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

/** YYYY-MM-DD 形式の日付 (任意。未指定時はサーバ側で current_date) */
const optionalDate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "日付は YYYY-MM-DD 形式で入力してください。",
  });

/** 入金登録 */
export const paymentEntryCreateSchema = z.object({
  document_id: z.string().uuid("帳票を指定してください。"),
  amount: z.coerce
    .number()
    .int("金額は整数で入力してください。")
    .min(1, "金額は1以上を入力してください。")
    .max(999_999_999),
  payment_method: z.enum(PAYMENT_METHODS, { message: "無効な入金方法です。" }).default("cash"),
  payment_date: optionalDate,
  reference_no: nullableText(100),
  notes: nullableText(500),
});

/** 入金削除 (query param 経由で id を受けるが、念のためスキーマも用意) */
export const paymentEntryDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
