import { z } from "zod";

export const menuItemCreateSchema = z.object({
  name: z.string().trim().min(1, "品目名は必須です。").max(100),
  description: z.string().trim().max(500).nullable().optional().transform(v => v || null),
  unit_price: z.coerce.number().int().min(0, "単価は0以上で入力してください。").default(0),
  tax_category: z.coerce.number().int().refine(v => v === 8 || v === 10, { message: "税率区分は8または10です。" }).default(10),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const menuItemUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional().transform(v => v || null),
  unit_price: z.coerce.number().int().min(0).optional(),
  tax_category: z.coerce.number().int().refine(v => v === 8 || v === 10, { message: "税率区分は8または10です。" }).optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const menuItemDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

export const menuItemCsvImportSchema = z.object({
  action: z.literal("csv_import"),
  csv: z.string().min(1, "CSVデータは必須です。"),
});
