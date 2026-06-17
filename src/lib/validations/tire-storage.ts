import { z } from "zod";

/**
 * タイヤ保管管理 (Tire Storage) のバリデーションスキーマ。
 *
 * 店舗で預かっている顧客のタイヤを管理する。各保管記録は顧客・車両に
 * 紐付き、季節交換時期 (swap_month) をリマインドに利用する。
 *
 * DB スキーマは supabase/migrations/20260612000017_tire_storage.sql を参照。
 */

export const TIRE_TYPES = ["summer", "winter", "all_season"] as const;
export type TireType = (typeof TIRE_TYPES)[number];

export const TIRE_TYPE_LABEL: Record<TireType, string> = {
  summer: "夏",
  winter: "冬",
  all_season: "オールシーズン",
};

export const TIRE_STORAGE_STATUSES = ["stored", "returned", "disposed"] as const;
export type TireStorageStatus = (typeof TIRE_STORAGE_STATUSES)[number];

export const TIRE_STORAGE_STATUS_LABEL: Record<TireStorageStatus, string> = {
  stored: "保管中",
  returned: "返却済",
  disposed: "廃棄",
};

/** GET の status フィルタ: stored / returned / all */
export const TIRE_STORAGE_STATUS_FILTERS = ["stored", "returned", "all"] as const;
export type TireStorageStatusFilter = (typeof TIRE_STORAGE_STATUS_FILTERS)[number];

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

/** 1–12 の交換推奨月 or null。空文字 / undefined は null。 */
const optionalSwapMonth = z
  .union([z.coerce.number().int("整数で指定してください。").min(1).max(12), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));

/** 空文字 / undefined を null に正規化する nullable な YYYY-MM-DD 日付 */
const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日付は YYYY-MM-DD 形式で指定してください。"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => (v ? v : null));

const tireStorageBase = z.object({
  customer_id: optionalUuid,
  vehicle_id: optionalUuid,
  customer_name: optionalText(80),
  vehicle_info: optionalText(120),
  tire_type: z.enum(TIRE_TYPES).default("winter"),
  tire_size: optionalText(30),
  brand: optionalText(80),
  quantity: z.coerce.number().int("整数で指定してください。").min(1, "1 本以上で指定してください。").max(8).default(4),
  storage_location: optionalText(80),
  swap_month: optionalSwapMonth,
  notes: optionalText(500),
});

export const tireStorageCreateSchema = tireStorageBase;

export const tireStorageUpdateSchema = z.object({
  id: z.string().uuid("保管記録 ID が不正です。"),
  customer_id: optionalUuid,
  vehicle_id: optionalUuid,
  customer_name: optionalText(80),
  vehicle_info: optionalText(120),
  tire_type: z.enum(TIRE_TYPES).optional(),
  tire_size: optionalText(30),
  brand: optionalText(80),
  quantity: z.coerce.number().int("整数で指定してください。").min(1, "1 本以上で指定してください。").max(8).optional(),
  storage_location: optionalText(80),
  swap_month: optionalSwapMonth,
  status: z.enum(TIRE_STORAGE_STATUSES).optional(),
  returned_at: optionalDate,
  notes: optionalText(500),
});

export type TireStorageCreateInput = z.infer<typeof tireStorageCreateSchema>;
export type TireStorageUpdateInput = z.infer<typeof tireStorageUpdateSchema>;
