import { z } from "zod";

/**
 * 部品発注管理 (Parts Ordering Management) のバリデーションスキーマ。
 *
 * 案件 (予約) ごとに発注した部品を追跡する。DB スキーマは
 * supabase/migrations/20260612000019_parts_orders.sql を参照。
 */

export const PARTS_ORDER_STATUSES = ["ordered", "partial", "received", "cancelled"] as const;
export type PartsOrderStatus = (typeof PARTS_ORDER_STATUSES)[number];

export const PARTS_ORDER_STATUS_LABEL: Record<PartsOrderStatus, string> = {
  ordered: "発注済",
  partial: "一部入荷",
  received: "入荷済",
  cancelled: "キャンセル",
};

/** GET フィルタ: status は上記 4 つ + "all" を許容 */
export const PARTS_ORDER_STATUS_FILTERS = [...PARTS_ORDER_STATUSES, "all"] as const;
export type PartsOrderStatusFilter = (typeof PARTS_ORDER_STATUS_FILTERS)[number];

/** 空文字 / undefined を null に正規化する nullable uuid */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 空文字 / null を null に正規化する nullable text */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);

/** 空文字 / undefined を null に正規化する nullable な YYYY-MM-DD 日付 */
const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日付は YYYY-MM-DD 形式で指定してください。"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => (v ? v : null));

/** 単価 (円, 整数, 0 以上)。null 可。 */
const optionalUnitPrice = z
  .union([
    z.coerce.number().int("単価は整数で指定してください。").min(0, "単価は 0 以上で指定してください。"),
    z.null(),
  ])
  .optional()
  .transform((v) => (v == null ? null : v));

export const partsOrderCreateSchema = z.object({
  reservation_id: optionalUuid,
  part_name: z.string().trim().min(1, "部品名は必須です。").max(120),
  part_number: optionalText(60),
  supplier: optionalText(120),
  quantity: z.coerce
    .number()
    .int("数量は整数で指定してください。")
    .min(1, "数量は 1 以上で指定してください。")
    .max(9999, "数量が大きすぎます。")
    .default(1),
  unit_price: optionalUnitPrice,
  status: z.enum(PARTS_ORDER_STATUSES).default("ordered"),
  ordered_at: optionalDate,
  expected_at: optionalDate,
  notes: optionalText(500),
});
export type PartsOrderCreateInput = z.infer<typeof partsOrderCreateSchema>;

export const partsOrderUpdateSchema = z.object({
  id: z.string().uuid("発注 ID が不正です。"),
  reservation_id: optionalUuid,
  part_name: z.string().trim().min(1, "部品名は必須です。").max(120).optional(),
  part_number: optionalText(60),
  supplier: optionalText(120),
  quantity: z.coerce
    .number()
    .int("数量は整数で指定してください。")
    .min(1, "数量は 1 以上で指定してください。")
    .max(9999, "数量が大きすぎます。")
    .optional(),
  unit_price: optionalUnitPrice,
  status: z.enum(PARTS_ORDER_STATUSES).optional(),
  ordered_at: optionalDate,
  expected_at: optionalDate,
  received_at: optionalDate,
  notes: optionalText(500),
});
export type PartsOrderUpdateInput = z.infer<typeof partsOrderUpdateSchema>;
