import { z } from "zod";

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "顧客名は必須です。").max(100),
  name_kana: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  email: z.string().trim().email("有効なメールアドレスを入力してください。").nullable().optional().transform(v => v || null),
  phone: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  postal_code: z.string().trim().max(10).nullable().optional().transform(v => v || null),
  address: z.string().trim().max(200).nullable().optional().transform(v => v || null),
  note: z.string().trim().max(1000).nullable().optional().transform(v => v || null),
});

export const customerUpdateSchema = customerCreateSchema.extend({
  id: z.string().uuid("無効なIDです。"),
});

export const customerDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
