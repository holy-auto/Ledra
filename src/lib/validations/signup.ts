import { z } from "zod";

/** サインアップリクエストのバリデーションスキーマ */
export const signupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "メールアドレスを入力してください。")
      .email("有効なメールアドレスを入力してください。"),
    // パスワードレス（メールリンク）登録ではパスワードを省略できる。
    passwordless: z.boolean().optional().default(false),
    password: z.string().max(128, "パスワードは128文字以内で入力してください。").optional(),
    shop_name: z
      .string()
      .trim()
      .min(1, "店舗名（個人事業主は屋号）を入力してください。")
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
  })
  .superRefine((data, ctx) => {
    // パスワード方式のときだけ 8 文字以上を必須化する。
    if (!data.passwordless) {
      if (!data.password || data.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "パスワードは8文字以上で入力してください。",
        });
      }
    }
  });

export type SignupInput = z.infer<typeof signupSchema>;
