import { z } from "zod";

export const menuItemCreateSchema = z.object({
  name: z.string().trim().min(1, "品目名は必須です。").max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
  unit_price: z.coerce.number().int().min(0, "単価は0以上で入力してください。").default(0),
  cost_price: z.coerce.number().int().min(0, "原価は0以上で入力してください。").default(0),
  margin_rate: z.coerce.number().min(-100, "利益率は-100以上で入力してください。").max(10000).nullable().optional(),
  tax_category: z.coerce
    .number()
    .int()
    .refine((v) => v === 8 || v === 10, { message: "税率区分は8または10です。" })
    .default(10),
  sort_order: z.coerce.number().int().min(0).default(0),
  estimated_minutes: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  labor_hours: z.coerce.number().min(0, "標準工数は0以上で入力してください。").max(1000).nullable().optional(),
});

export const menuItemUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  name: z.string().trim().min(1).max(100).optional(),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
  unit_price: z.coerce.number().int().min(0).optional(),
  cost_price: z.coerce.number().int().min(0).optional(),
  margin_rate: z.coerce.number().min(-100).max(10000).nullable().optional(),
  tax_category: z.coerce
    .number()
    .int()
    .refine((v) => v === 8 || v === 10, { message: "税率区分は8または10です。" })
    .optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  estimated_minutes: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  labor_hours: z.coerce.number().min(0).max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const menuItemDeleteSchema = z
  .object({
    // 単一無効化（従来）／複数一括無効化（ids）の両対応。どちらか一方を指定する。
    id: z.string().uuid("無効なIDです。").optional(),
    ids: z.array(z.string().uuid("無効なIDです。")).min(1).max(500).optional(),
  })
  .refine((v) => Boolean(v.id) || Boolean(v.ids?.length), {
    message: "無効化する品目が指定されていません。",
  });

export const menuItemCsvImportSchema = z.object({
  action: z.literal("csv_import"),
  csv: z.string().min(1, "CSVデータは必須です。"),
});
