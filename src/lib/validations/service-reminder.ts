import { z } from "zod";

/**
 * 後日整備・交換部品提案 (Service Reminders) のバリデーションスキーマ。
 *
 * 車両の走行距離 / 前回施工日から交換推奨時期を算出し、アフター
 * フォロー提案を管理する。DB スキーマは
 * supabase/migrations/20260612000008_service_reminders.sql を参照。
 *
 * next_due_mileage / next_due_date は DB 側の GENERATED ALWAYS STORED 列
 * として算出されるため、ここでは入力 (last_service_* / recommended_*) のみ
 * を検証する。
 */

export const SERVICE_REMINDER_TYPES = ["mileage", "interval_months", "both"] as const;
export type ServiceReminderType = (typeof SERVICE_REMINDER_TYPES)[number];

export const SERVICE_REMINDER_TYPE_LABEL: Record<ServiceReminderType, string> = {
  mileage: "走行距離ベース",
  interval_months: "期間ベース",
  both: "走行距離・期間 両方",
};

export const SERVICE_REMINDER_STATUSES = ["active", "snoozed", "completed", "cancelled"] as const;
export type ServiceReminderStatus = (typeof SERVICE_REMINDER_STATUSES)[number];

export const SERVICE_REMINDER_STATUS_LABEL: Record<ServiceReminderStatus, string> = {
  active: "有効",
  snoozed: "スヌーズ",
  completed: "完了",
  cancelled: "キャンセル",
};

/** GET フィルタ: active / due (期限間近) / all */
export const SERVICE_REMINDER_STATUS_FILTERS = ["active", "due", "all"] as const;
export type ServiceReminderStatusFilter = (typeof SERVICE_REMINDER_STATUS_FILTERS)[number];

/** 空文字 / undefined を null に正規化する nullable uuid */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 空文字 / undefined を null に正規化する nullable な YYYY-MM-DD 日付 */
const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日付は YYYY-MM-DD 形式で指定してください。"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);

/** 走行距離・期間 (正の整数 or null)。0 は意味を持たないので 1 以上を要求。 */
const optionalPositiveInt = (max: number) =>
  z
    .union([z.coerce.number().int("整数で指定してください。").min(1, "1 以上で指定してください。").max(max), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v));

/** 走行距離の実測値 (0 以上の整数 or null)。新車登録直後など 0 を許容。 */
const optionalNonNegInt = (max: number) =>
  z
    .union([z.coerce.number().int("整数で指定してください。").min(0, "0 以上で指定してください。").max(max), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v));

const reminderBase = z.object({
  customer_id: optionalUuid,
  vehicle_id: optionalUuid,
  service_name: z.string().trim().min(1, "サービス名は必須です。").max(120),
  reminder_type: z.enum(SERVICE_REMINDER_TYPES).default("mileage"),
  last_service_mileage: optionalNonNegInt(9_999_999),
  recommended_interval_km: optionalPositiveInt(999_999),
  last_service_date: optionalDate,
  recommended_interval_months: optionalPositiveInt(600),
  notes: optionalText(2000),
});

/**
 * reminder_type に応じて必要な入力が揃っているかを検証する。
 *  - mileage: recommended_interval_km が必須
 *  - interval_months: recommended_interval_months が必須
 *  - both: 両方必須
 * (last_service_* は未確定でも登録できるよう必須にしない。次回推奨日時は
 *  両方揃ったときのみ DB 側で算出される。)
 */
export const serviceReminderCreateSchema = reminderBase
  .refine((v) => v.reminder_type === "interval_months" || v.recommended_interval_km != null, {
    message: "走行距離ベースの提案には推奨交換距離 (km) が必要です。",
    path: ["recommended_interval_km"],
  })
  .refine((v) => v.reminder_type === "mileage" || v.recommended_interval_months != null, {
    message: "期間ベースの提案には推奨交換間隔 (月) が必要です。",
    path: ["recommended_interval_months"],
  });

export const serviceReminderUpdateSchema = z.object({
  id: z.string().uuid("リマインダー ID が不正です。"),
  service_name: z.string().trim().min(1, "サービス名は必須です。").max(120).optional(),
  reminder_type: z.enum(SERVICE_REMINDER_TYPES).optional(),
  last_service_mileage: optionalNonNegInt(9_999_999),
  recommended_interval_km: optionalPositiveInt(999_999),
  last_service_date: optionalDate,
  recommended_interval_months: optionalPositiveInt(600),
  status: z.enum(SERVICE_REMINDER_STATUSES).optional(),
  // PATCH で「通知済み」をマークする際に true を送る (route 側で notified_at=now())。
  mark_notified: z.boolean().optional(),
  notes: optionalText(2000),
});

export type ServiceReminderCreateInput = z.infer<typeof serviceReminderCreateSchema>;
export type ServiceReminderUpdateInput = z.infer<typeof serviceReminderUpdateSchema>;
