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
  // 終日予約。true のとき start_time / end_time は無視して NULL 保存する（API 側で正規化）。
  all_day: z.boolean().optional(),
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
  assigned_staff_id: nullableUuid,
  booth_id: nullableUuid,
  // 工程テンプレート（作業のタスク分解）。設定するとワークフロー開始で reservation_step_logs に展開される。
  workflow_template_id: nullableUuid,
  // この予約で使う代車。日程候補の代車空き判定に使う。
  loaner_car_id: nullableUuid,
  // 作成する店舗。未指定ならサーバが決める（`resolveStoreId`）。
  // 他テナントの店舗 ID はサーバ側で弾く
  store_id: nullableUuid,
  note: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  // E3-1 是正 (2026-09-08): 管理側の予約作成には重複チェックが無く、
  // 同一時間帯への二重登録を検知できなかった（顧客/外部予約経路には既にある）。
  // 重複検知時は 409 で警告を返し、承知の上での登録は force:true で再送する。
  force: z.boolean().optional(),
});

/** update は全ステータス遷移を許容 (完了/キャンセル含む)。 */
export const reservationUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  title: z.string().trim().max(200).optional(),
  customer_id: nullableUuid,
  vehicle_id: nullableUuid,
  scheduled_date: z.string().trim().optional(),
  // 終日予約。true のとき start_time / end_time は NULL に正規化する（API 側で処理）。
  all_day: z.boolean().optional(),
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
  assigned_staff_id: nullableUuid,
  booth_id: nullableUuid,
  // 工程テンプレート（作業のタスク分解）。設定するとワークフロー開始で reservation_step_logs に展開される。
  workflow_template_id: nullableUuid,
  // この予約で使う代車。日程候補の代車空き判定に使う。
  loaner_car_id: nullableUuid,
  // 部品交換あり。ON にすると part_installations (draft) を自動作成する。
  parts_replacement: z.boolean().optional(),
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
  // E3-1 是正 (2026-09-08): 日時変更にも重複チェックを追加。force:true で警告を無視して更新。
  force: z.boolean().optional(),
});

export const reservationDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
