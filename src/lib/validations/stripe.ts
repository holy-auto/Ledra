import { z } from "zod";

export const checkoutSchema = z.object({
  tenant_id: z.string().uuid("テナントIDは必須です。").optional(),
  access_token: z.string().min(1, "アクセストークンは必須です。").optional(),
  plan_tier: z.enum(["starter", "standard", "pro"], { message: "無効なプランです。" }),
  annual: z.boolean().optional().default(false),
});

export const portalSchema = z.object({
  access_token: z.string().min(1, "アクセストークンは必須です。"),
  return_url: z.string().url().nullable().optional(),
});

export const resumeSchema = z.object({
  access_token: z.string().min(1, "アクセストークンは必須です。"),
});

export const billingStateSchema = z.object({
  access_token: z.string().min(1, "アクセストークンは必須です。"),
});
