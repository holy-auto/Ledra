import { z } from "zod";

export const vehicleCreateSchema = z.object({
  maker: z.string().trim().min(1, "メーカーは必須です。").max(100),
  model: z.string().trim().min(1, "車種は必須です。").max(100),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  plate_display: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  customer_name: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  customer_email: z.string().trim().email().nullable().optional().transform(v => v || null),
  customer_phone_masked: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  notes: z.string().trim().max(500).nullable().optional().transform(v => v || null),
});
