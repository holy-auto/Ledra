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

const branchBaseFields = {
  name_kana: optionalTrimmed(100),
  postal_code: optionalTrimmed(10),
  address: optionalTrimmed(200),
  phone: optionalTrimmed(20),
  contact_person: optionalTrimmed(100),
  contact_email: optionalEmail,
  note: optionalTrimmed(1000),
  // 工賃の時間単価（円/時、税抜）。空 = 自社既定を使う
  labor_rate_per_hour: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z
      .number({ message: "時間単価は数値で入力してください。" })
      .int("時間単価は整数で入力してください。")
      .positive("時間単価は1以上で入力してください。")
      .max(1_000_000, "時間単価が大きすぎます。")
      .nullable(),
  ),
};

export const branchCreateSchema = z.object({
  customer_id: z.string().uuid("無効な顧客IDです。"),
  name: z.string().trim().min(1, "支店名は必須です。").max(100),
  ...branchBaseFields,
});

export const branchUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  name: z.string().trim().min(1, "支店名は必須です。").max(100),
  ...branchBaseFields,
});

export const branchDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
