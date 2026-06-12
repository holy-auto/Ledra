import { z } from "zod";

/** contact_schedules.contact_type の許容値 */
export const contactTypes = ["call", "visit", "email", "sms", "line"] as const;
/** contact_schedules.status の許容値 */
export const contactStatuses = ["pending", "completed", "skipped", "rescheduled"] as const;
/** contact_schedules.result の許容値 */
export const contactResults = ["success", "no_answer", "declined", "rescheduled", "converted"] as const;

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

export const contactScheduleCreateSchema = z.object({
  customer_id: nullableUuid,
  vehicle_id: nullableUuid,
  assigned_user_id: nullableUuid,
  contact_type: z.enum(contactTypes).default("call"),
  scheduled_at: z.string().trim().min(1, "予定日時は必須です。"),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const contactScheduleUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  status: z.enum(contactStatuses).optional(),
  result: z
    .enum(contactResults)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  // client が明示的に completed_at を送れるが、status=completed の場合は
  // route 側で now() を強制セットするため任意。
  completed_at: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const contactScheduleDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
