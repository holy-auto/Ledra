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

export const customerCreateSchema = z
  .object({
    name: z.string().trim().min(1, "顧客名は必須です。").max(100),
    name_kana: optionalTrimmed(100),
    email: optionalEmail,
    phone: optionalTrimmed(20),
    postal_code: optionalTrimmed(10),
    address: optionalTrimmed(200),
    note: optionalTrimmed(1000),
    // 顧客区分 (個人/法人)。既定は個人。
    customer_type: z.enum(["individual", "corporate"]).default("individual"),
    // 法人の支払いサイクル。都度払い / 合算(締め払い)。個人は null。
    billing_cycle: z
      .enum(["per_job", "consolidated"])
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    // 締め日・支払いサイト等の自由記述メモ。
    billing_terms_note: optionalTrimmed(500),
  })
  // 法人は支払いサイクルの入力を必須にする (合算 or 都度をワークフローが判定に使う)。
  .refine((v) => v.customer_type !== "corporate" || v.billing_cycle !== null, {
    message: "法人顧客は支払いサイクル (都度払い / 合算) を選択してください。",
    path: ["billing_cycle"],
  });

export const customerUpdateSchema = z
  .object({
    id: z.string().uuid("無効なIDです。"),
    name: z.string().trim().min(1, "顧客名は必須です。").max(100),
    name_kana: optionalTrimmed(100),
    email: optionalEmail,
    phone: optionalTrimmed(20),
    postal_code: optionalTrimmed(10),
    address: optionalTrimmed(200),
    note: optionalTrimmed(1000),
    customer_type: z.enum(["individual", "corporate"]).default("individual"),
    billing_cycle: z
      .enum(["per_job", "consolidated"])
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    billing_terms_note: optionalTrimmed(500),
  })
  .refine((v) => v.customer_type !== "corporate" || v.billing_cycle !== null, {
    message: "法人顧客は支払いサイクル (都度払い / 合算) を選択してください。",
    path: ["billing_cycle"],
  });

export const customerDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
