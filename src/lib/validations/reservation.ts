import { z } from "zod";

const statuses = ["confirmed", "arrived", "in_progress", "completed", "cancelled"] as const;
/** 初期登録時に許可するステータス。履歴操作 (completed / cancelled) は update 側で。 */
const initialStatuses = ["confirmed", "arrived", "in_progress"] as const;

const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効なIDです。",
  });

export const reservationCreateSchema = z.object({
  title: z.string().trim().min(1, "予約タイトルは必須です。").max(200),
  customer_id: nullableUuid,
  vehicle_id: nullableUuid,
  scheduled_date: z.string().trim().min(1, "予約日は必須です。"),
  start_time: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  end_time: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  status: z.enum(initialStatuses).default("confirmed"),
  menu_items_json: z.any().nullable().optional(),
  estimated_amount: z.coerce.number().int().min(0).nullable().optional(),
  assigned_user_id: nullableUuid,
  note: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

/** update は全ステータス遷移を許容 (完了/キャンセル含む)。 */
export const reservationUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  title: z.string().trim().max(200).optional(),
  customer_id: nullableUuid,
  vehicle_id: nullableUuid,
  scheduled_date: z.string().trim().optional(),
  start_time: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  end_time: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  status: z.enum(statuses).optional(),
  menu_items_json: z.any().nullable().optional(),
  estimated_amount: z.coerce.number().int().min(0).nullable().optional(),
  assigned_user_id: nullableUuid,
  note: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  cancel_reason: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const reservationDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
