import { z } from "zod";

export const brandCreateSchema = z.object({
  name: z.string().trim().min(1, "ブランド名は必須です。").max(100),
  description: z.string().trim().max(500).nullable().optional().transform(v => v || null),
  website_url: z.string().trim().max(200).nullable().optional().transform(v => v || null),
});

export const brandUpdateSchema = brandCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export const coatingProductCreateSchema = z.object({
  brand_id: z.string().uuid("ブランドを選択してください。"),
  name: z.string().trim().min(1, "製品名は必須です。").max(100),
  product_code: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  description: z.string().trim().max(500).nullable().optional().transform(v => v || null),
});

export const coatingProductUpdateSchema = coatingProductCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export type BrandCreateInput = z.infer<typeof brandCreateSchema>;
export type CoatingProductCreateInput = z.infer<typeof coatingProductCreateSchema>;
