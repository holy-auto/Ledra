import { z } from "zod";

/** 空文字 / undefined / null を全て null に寄せたい任意 string フィールド */
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

/** email は空文字 / null のときは許容し、値があるときだけ形式検証する */
const optionalEmail = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: "有効なメールアドレスを入力してください。",
  });

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "顧客名は必須です。").max(100),
  name_kana: optionalTrimmed(100),
  email: optionalEmail,
  phone: optionalTrimmed(20),
  postal_code: optionalTrimmed(10),
  address: optionalTrimmed(200),
  note: optionalTrimmed(1000),
});

export const customerUpdateSchema = customerCreateSchema.extend({
  id: z.string().uuid("無効なIDです。"),
});

export const customerDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
