import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "お名前は必須です。").max(100),
  email: z.string().trim().email("有効なメールアドレスを入力してください。"),
  company: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  category: z.string().trim().min(1, "お問い合わせ種別は必須です。").max(50),
  message: z.string().trim().min(1, "お問い合わせ内容は必須です。").max(5000),
});
