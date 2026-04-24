import { z } from "zod";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const inventoryItemCreateSchema = z.object({
  name: z.string().trim().min(1, "品目名は必須です。").max(200),
  sku: nullableText(100),
  category: nullableText(100),
  unit: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => v || "個"),
  current_stock: z.coerce.number().min(0).default(0),
  min_stock: z.coerce.number().min(0).default(0),
  unit_cost: z.coerce.number().int().min(0).nullable().optional(),
  note: nullableText(1000),
});

export const inventoryItemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: nullableText(100),
  category: nullableText(100),
  unit: z.string().trim().max(20).optional(),
  current_stock: z.coerce.number().min(0).optional(),
  min_stock: z.coerce.number().min(0).optional(),
  unit_cost: z.coerce.number().int().min(0).nullable().optional(),
  note: nullableText(1000),
  is_active: z.boolean().optional(),
});

export const inventoryMovementCreateSchema = z.object({
  item_id: z.string().uuid("品目を選択してください。"),
  type: z.enum(["in", "out", "adjust"], { message: "type は in / out / adjust のいずれかを指定してください" }),
  quantity: z.coerce.number().min(0, "quantity は 0 以上の数値を指定してください"),
  reason: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
  reservation_id: z.string().uuid().nullable().optional(),
});
