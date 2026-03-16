import { z } from "zod";

export const checkoutSchema = z.object({
  tenant_id: z.string().uuid("テナントIDは必須です。"),
  plan_tier: z.enum(["mini", "standard", "pro"], { message: "無効なプランです。" }),
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
