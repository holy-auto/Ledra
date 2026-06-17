import { z } from "zod";

/** coupons.discount_type の許容値 */
export const couponDiscountTypes = ["fixed", "percent"] as const;
export type CouponDiscountType = (typeof couponDiscountTypes)[number];

/** coupon_issues.status の許容値 */
export const couponIssueStatuses = ["issued", "used", "expired", "revoked"] as const;

/** coupon_issues.issue_channel の許容値 */
export const couponIssueChannels = ["manual", "line", "sms", "email"] as const;

/** 空文字を null に正規化する nullable UUID。client から空 select が来るケースを吸収する。 */
const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効なIDです。",
  });

/** 空文字/未指定を null に正規化する nullable な日付文字列 (YYYY-MM-DD)。 */
const nullableDate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: "日付の形式が不正です (YYYY-MM-DD)。" });

const nullableNonNegInt = z
  .union([z.coerce.number().int().min(0), z.null()])
  .optional()
  .transform((v) => (v == null ? null : v));

export const couponCreateSchema = z
  .object({
    // 未指定/空文字なら route 側で 8 文字英大文字+数字を自動生成する。
    code: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .transform((v) => v || null),
    name: z.string().trim().min(1, "クーポン名は必須です。").max(100),
    description: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional()
      .transform((v) => v || null),
    discount_type: z.enum(couponDiscountTypes).default("fixed"),
    discount_value: z.coerce
      .number()
      .int("割引値は整数で入力してください。")
      .positive("割引値は1以上で入力してください。"),
    min_purchase: nullableNonNegInt,
    max_uses: z
      .union([z.coerce.number().int().positive(), z.null()])
      .optional()
      .transform((v) => (v == null ? null : v)),
    valid_from: nullableDate,
    valid_until: nullableDate,
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  // percent は 1-100、fixed は (positive 済みなので) 1 以上であればよい。
  .refine((v) => v.discount_type !== "percent" || (v.discount_value >= 1 && v.discount_value <= 100), {
    message: "割引率(percent)は1〜100の整数で入力してください。",
    path: ["discount_value"],
  })
  // valid_from <= valid_until (両方指定時)。
  .refine((v) => !v.valid_from || !v.valid_until || v.valid_from <= v.valid_until, {
    message: "有効期間の開始日は終了日以前にしてください。",
    path: ["valid_until"],
  });

export const couponUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  name: z.string().trim().min(1).max(100).optional(),
  description: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  valid_from: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  valid_until: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  is_active: z.boolean().optional(),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
});

/** POST /api/admin/coupons/[id]/issue */
export const couponIssueSchema = z.object({
  customer_id: nullableUuid,
  // 発行から expires_days 日後を expires_at にセットする (未指定なら無期限)。
  expires_days: z
    .union([z.coerce.number().int().positive().max(3650), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v)),
  issue_channel: z.enum(couponIssueChannels).default("manual"),
});

/** POST /api/admin/coupons/[id]/use */
export const couponUseSchema = z.object({
  issue_id: z.string().uuid("発行レコードIDが不正です。"),
  document_id: nullableUuid,
  discount_applied: nullableNonNegInt,
});

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;
export type CouponIssueInput = z.infer<typeof couponIssueSchema>;
export type CouponUseInput = z.infer<typeof couponUseSchema>;
