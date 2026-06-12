import { z } from "zod";

/**
 * メンテナンスパック (チケット制) のバリデーションスキーマ。
 *
 * コーティング / PPF 施工店向けの「3年保証メンテパック」等を
 * 販売・管理するための入力検証。DB スキーマは
 * supabase/migrations/20260612000003_maintenance_packs.sql を参照。
 */

export const MAINTENANCE_PACK_STATUSES = ["active", "expired", "exhausted", "cancelled"] as const;
export type MaintenancePackStatus = (typeof MAINTENANCE_PACK_STATUSES)[number];

export const MAINTENANCE_PACK_STATUS_LABEL: Record<MaintenancePackStatus, string> = {
  active: "アクティブ",
  expired: "期限切れ",
  exhausted: "使い切り",
  cancelled: "キャンセル",
};

/** GET フィルタ: status は上記 4 つ + "all" を許容 */
export const MAINTENANCE_PACK_STATUS_FILTERS = [...MAINTENANCE_PACK_STATUSES, "all"] as const;
export type MaintenancePackStatusFilter = (typeof MAINTENANCE_PACK_STATUS_FILTERS)[number];

/** 空文字 / undefined を null に正規化する nullable uuid */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 空文字 / undefined を null に正規化する nullable な YYYY-MM-DD 日付 */
const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日付は YYYY-MM-DD 形式で指定してください。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);

/** 価格 (円, 整数, 0 以上)。null 可。 */
const optionalPrice = z
  .union([z.coerce.number().int("価格は整数で指定してください。").min(0, "価格は 0 以上で指定してください。"), z.null()])
  .optional()
  .transform((v) => (v == null ? null : v));

export const maintenancePackCreateSchema = z
  .object({
    name: z.string().trim().min(1, "パック名は必須です。").max(120),
    description: optionalText(2000),
    total_tickets: z.coerce
      .number()
      .int("チケット総数は整数で指定してください。")
      .min(1, "チケット総数は 1 以上で指定してください。")
      .max(999, "チケット総数が大きすぎます。")
      .default(1),
    price: optionalPrice,
    valid_from: optionalDate,
    valid_until: optionalDate,
    customer_id: optionalUuid,
    vehicle_id: optionalUuid,
    notes: optionalText(2000),
  })
  .refine(
    (v) => v.valid_from == null || v.valid_until == null || v.valid_from <= v.valid_until,
    { message: "有効期間の開始日は終了日以前にしてください。", path: ["valid_until"] },
  );

export const maintenancePackUpdateSchema = z
  .object({
    id: z.string().uuid("パック ID が不正です。"),
    name: z.string().trim().min(1, "パック名は必須です。").max(120).optional(),
    description: optionalText(2000),
    price: optionalPrice,
    valid_from: optionalDate,
    valid_until: optionalDate,
    customer_id: optionalUuid,
    vehicle_id: optionalUuid,
    status: z.enum(MAINTENANCE_PACK_STATUSES).optional(),
    notes: optionalText(2000),
  })
  .refine(
    (v) => v.valid_from == null || v.valid_until == null || v.valid_from <= v.valid_until,
    { message: "有効期間の開始日は終了日以前にしてください。", path: ["valid_until"] },
  );

/** チケット消費 (POST /[id]/use) のボディ */
export const maintenancePackUseSchema = z.object({
  reservation_id: optionalUuid,
  notes: optionalText(2000),
});

export type MaintenancePackCreateInput = z.infer<typeof maintenancePackCreateSchema>;
export type MaintenancePackUpdateInput = z.infer<typeof maintenancePackUpdateSchema>;
export type MaintenancePackUseInput = z.infer<typeof maintenancePackUseSchema>;
