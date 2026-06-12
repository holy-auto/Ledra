import { z } from "zod";

/**
 * 請求按分 (Billing Split) のバリデーションスキーマ。
 *
 * - billing_splits は 1 件の帳票 (documents) を保険・自費・その他へ
 *   按分して記録する。
 * - split_amount は整数 (円)。split_ratio は表示用の % (0〜100)。
 */

const SPLIT_TYPES = ["insurance", "self_pay", "other"] as const;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

/** 按分作成 */
export const billingSplitCreateSchema = z.object({
  document_id: z.string().uuid("帳票を指定してください。"),
  split_type: z.enum(SPLIT_TYPES, { message: "無効な按分種別です。" }),
  payer_name: nullableText(120),
  claim_number: nullableText(60),
  split_amount: z.coerce
    .number()
    .int("金額は整数で入力してください。")
    .min(0, "金額は0以上を入力してください。")
    .max(999_999_999),
  split_ratio: z.coerce
    .number()
    .min(0, "比率は0以上で入力してください。")
    .max(100, "比率は100以下で入力してください。")
    .nullable()
    .optional(),
  notes: nullableText(500),
});

/** 按分更新 (id 必須 + 各項目は任意) */
export const billingSplitUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  split_type: z.enum(SPLIT_TYPES, { message: "無効な按分種別です。" }).optional(),
  payer_name: nullableText(120),
  claim_number: nullableText(60),
  split_amount: z.coerce
    .number()
    .int("金額は整数で入力してください。")
    .min(0, "金額は0以上を入力してください。")
    .max(999_999_999)
    .optional(),
  split_ratio: z.coerce
    .number()
    .min(0, "比率は0以上で入力してください。")
    .max(100, "比率は100以下で入力してください。")
    .nullable()
    .optional(),
  notes: nullableText(500),
});

/** 按分削除 (query param 経由で id を受けるが、念のためスキーマも用意) */
export const billingSplitDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

export type BillingSplitCreateInput = z.infer<typeof billingSplitCreateSchema>;
export type BillingSplitUpdateInput = z.infer<typeof billingSplitUpdateSchema>;
