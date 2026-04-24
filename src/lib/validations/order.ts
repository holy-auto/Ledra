import { z } from "zod";

export const orderCreateSchema = z.object({
  to_tenant_id: z
    .string()
    .uuid("発注先テナントIDの形式が不正です。")
    .nullable()
    .optional()
    .transform((v) => v || null),
  title: z.string().trim().min(1, "タイトルは必須です。").max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  category: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  budget: z.union([z.number(), z.string()]).nullable().optional(),
  deadline: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  vehicle_id: z
    .string()
    .uuid("車両IDの形式が不正です。")
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const ORDER_STATUSES = [
  "pending",
  "quoting",
  "accepted",
  "in_progress",
  "approval_pending",
  "payment_pending",
  "completed",
  "rejected",
  "cancelled",
] as const;

export const orderUpdateSchema = z.object({
  id: z.string().uuid("注文IDは必須です。"),
  status: z.enum(ORDER_STATUSES, { message: "無効なステータスです。" }),
  cancel_reason: z.string().trim().max(500).nullable().optional(),
});

export const orderAcceptSchema = z.object({
  id: z.string().uuid("注文IDは必須です。"),
});
