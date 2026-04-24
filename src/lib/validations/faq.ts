import { z } from "zod";

export const faqCreateSchema = z.object({
  question: z.string().trim().min(1, "質問は必須です。").max(500),
  answer: z.string().trim().min(1, "回答は必須です。").max(5000),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const faqDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
