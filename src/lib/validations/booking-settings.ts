import { z } from "zod";

/** HH:MM または HH:MM:SS */
const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "時刻は HH:MM 形式です");

export const bookingSlotSchema = z.object({
  id: z.string().uuid().optional(),
  day_of_week: z.coerce.number().int().min(0).max(6, "曜日は 0〜6 を指定してください。"),
  start_time: timeString,
  end_time: timeString,
  max_bookings: z.coerce.number().int().min(1).default(1),
  is_active: z.boolean().default(true),
  label: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const closedDaySchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(["weekly", "specific"]),
    day_of_week: z.coerce.number().int().min(0).max(6).nullable().optional(),
    closed_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "closed_date は YYYY-MM-DD 形式です")
      .nullable()
      .optional(),
    note: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => (v.type === "weekly" ? v.day_of_week !== null && v.day_of_week !== undefined : true), {
    message: "weekly の場合は day_of_week が必要です",
    path: ["day_of_week"],
  })
  .refine((v) => (v.type === "specific" ? !!v.closed_date : true), {
    message: "specific の場合は closed_date が必要です",
    path: ["closed_date"],
  });

export const bookingSettingsPutSchema = z.object({
  slots: z.array(bookingSlotSchema).max(100).default([]),
  closed_days: z.array(closedDaySchema).max(500).default([]),
  deleted_slot_ids: z.array(z.string().uuid()).max(100).default([]),
  deleted_closed_day_ids: z.array(z.string().uuid()).max(500).default([]),
});
