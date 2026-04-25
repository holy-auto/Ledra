import { z } from "zod";

export const registerCreateSchema = z.object({
  name: z.string().trim().min(1, "レジ名は必須です").max(100),
  store_id: z.string().uuid("store_idは必須です"),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const registerUpdateSchema = z.object({
  id: z.string().uuid("idは必須です"),
  name: z.string().trim().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
});
