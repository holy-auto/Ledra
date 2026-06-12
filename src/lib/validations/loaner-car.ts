import { z } from "zod";

/**
 * 代車管理 (Loaner Cars) のバリデーションスキーマ。
 *
 * - loaner_cars: 店舗が保有する代車マスタ
 * - loaner_car_loans: 代車の貸出記録 (どの代車を・どの顧客に・どの予約に
 *   紐付けて貸し出したか / 返却予定 / 返却日)
 *
 * DB スキーマは supabase/migrations/20260612000016_loaner_cars.sql を参照。
 */

/** 空文字 / undefined を null に正規化する nullable uuid */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 空文字 / undefined を null に正規化する nullable text (trim + 最大長) */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);

/** 西暦 (1900–2100) or null。空文字 / undefined は null。 */
const optionalYear = z
  .union([z.coerce.number().int("整数で指定してください。").min(1900).max(2100), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));

/**
 * ISO 日時文字列 or null。datetime-local の値 (秒なし) も許容するため datetime
 * ではなく緩く検証する。空文字 / undefined / null はすべて null に正規化する。
 */
const optionalDateTime = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v == null || !Number.isNaN(new Date(v).getTime()), {
    message: "日時の形式が不正です。",
  });

// ─── 代車マスタ ───
export const loanerCarCreateSchema = z.object({
  name: z.string().trim().min(1, "管理名は必須です。").max(80),
  plate_display: optionalText(20),
  maker: optionalText(80),
  model: optionalText(80),
  year: optionalYear,
  color: optionalText(40),
  notes: optionalText(500),
});

export const loanerCarUpdateSchema = z.object({
  id: z.string().uuid("代車 ID が不正です。"),
  name: z.string().trim().min(1, "管理名は必須です。").max(80).optional(),
  plate_display: optionalText(20),
  maker: optionalText(80),
  model: optionalText(80),
  year: optionalYear,
  color: optionalText(40),
  notes: optionalText(500),
  is_active: z.boolean().optional(),
});

// ─── 貸出記録 ───
export const loanerLoanCreateSchema = z.object({
  loaner_car_id: z.string().uuid("代車 ID が不正です。"),
  reservation_id: optionalUuid,
  customer_id: optionalUuid,
  customer_name: optionalText(80),
  lent_at: optionalDateTime,
  return_due_at: optionalDateTime,
  notes: optionalText(500),
});

export const loanerLoanReturnSchema = z.object({
  id: z.string().uuid("貸出記録 ID が不正です。"),
  // 未指定なら route 側で now() を入れる。
  returned_at: optionalDateTime,
});

export type LoanerCarCreateInput = z.infer<typeof loanerCarCreateSchema>;
export type LoanerCarUpdateInput = z.infer<typeof loanerCarUpdateSchema>;
export type LoanerLoanCreateInput = z.infer<typeof loanerLoanCreateSchema>;
export type LoanerLoanReturnInput = z.infer<typeof loanerLoanReturnSchema>;
