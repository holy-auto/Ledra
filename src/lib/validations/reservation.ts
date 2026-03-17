import { z } from "zod";

const statuses = ["confirmed", "arrived", "in_progress", "completed", "cancelled"] as const;

export const reservationCreateSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  scheduled_date: z.string().min(1, "予約日は必須です。"),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  status: z.enum(statuses).default("confirmed"),
  menu_items_json: z.any().nullable().optional(),
  estimated_amount: z.number().min(0).nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional().transform(v => v || null),
  cancel_reason: z.string().trim().max(500).nullable().optional().transform(v => v || null),
});

export const reservationUpdateSchema = reservationCreateSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const reservationDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
