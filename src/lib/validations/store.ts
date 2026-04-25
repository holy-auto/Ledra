import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

const businessHours = z.any().nullable().optional();

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1, "店舗名は必須です").max(100),
  address: optionalText(300),
  phone: optionalText(40),
  email: optionalText(120),
  manager_name: optionalText(80),
  business_hours: businessHours,
});

export const storeUpdateSchema = z.object({
  id: z.string().uuid("id is required"),
  name: z.string().trim().min(1).max(100).optional(),
  address: optionalText(300),
  phone: optionalText(40),
  email: optionalText(120),
  manager_name: optionalText(80),
  business_hours: businessHours,
  is_active: z.boolean().optional(),
});
