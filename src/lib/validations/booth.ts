import { z } from "zod";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const boothCreateSchema = z.object({
  name: z.string().trim().min(1, "ブース名は必須です。").max(100),
  booth_type: nullableText(40),
  capacity: z.coerce.number().int().min(1).max(50).default(1),
  color: nullableText(20),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  note: nullableText(500),
  is_active: z.boolean().default(true),
});

export const boothUpdateSchema = boothCreateSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const boothDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
