import { z } from "zod";

export const orderCreateSchema = z.object({
  to_tenant_id: z.string().uuid("発注先テナントIDは必須です。"),
  title: z.string().trim().min(1, "タイトルは必須です。").max(200),
  description: z.string().trim().max(2000).nullable().optional().transform(v => v || null),
  category: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  budget: z.number().min(0).nullable().optional(),
  deadline: z.string().nullable().optional().transform(v => v || null),
});

export const orderUpdateSchema = z.object({
  id: z.string().uuid("注文IDは必須です。"),
  status: z.enum(["pending", "accepted", "in_progress", "completed", "rejected", "cancelled"], {
    message: "無効なステータスです。",
  }),
});
