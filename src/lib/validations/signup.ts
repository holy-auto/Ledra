import { z } from "zod";

/** サインアップリクエストのバリデーションスキーマ */
export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "メールアドレスを入力してください。")
    .email("有効なメールアドレスを入力してください。"),
  password: z
    .string()
    .min(8, "パスワードは8文字以上で入力してください。")
    .max(128, "パスワードは128文字以内で入力してください。"),
  shop_name: z
    .string()
    .trim()
    .min(1, "店舗名を入力してください。")
    .max(100, "店舗名は100文字以内で入力してください。"),
  display_name: z
    .string()
    .trim()
    .max(50, "担当者名は50文字以内で入力してください。")
    .nullable()
    .optional()
    .transform((v) => v || null),
  contact_phone: z
    .string()
    .trim()
    .max(20, "電話番号は20文字以内で入力してください。")
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export type SignupInput = z.infer<typeof signupSchema>;
