import { z } from "zod";

export const memberAddSchema = z.object({
  email: z.string().trim().toLowerCase().email("有効なメールアドレスを入力してください。"),
  display_name: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  role: z.enum(["admin", "staff", "viewer"]).nullable().optional(),
});

export const memberRoleChangeSchema = z.object({
  user_id: z.string().uuid("ユーザーIDは必須です。"),
  role: z.enum(["admin", "staff", "viewer"], { message: "無効なロールです。" }),
});

export const memberDeleteSchema = z.object({
  user_id: z.string().uuid("ユーザーIDは必須です。"),
});
