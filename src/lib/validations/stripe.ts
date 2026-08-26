import { z } from "zod";

export const checkoutSchema = z.object({
  access_token: z.string().min(1, "アクセストークンは必須です。"),
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

export const stripeConnectCreateSchema = z.object({
  return_url: z.string().trim().max(2000).nullable().optional(),
  refresh_url: z.string().trim().max(2000).nullable().optional(),
  /**
   * 一緒に申請する決済手段（`OPTIONAL_CAPABILITY_IDS`）。**既定は空** ——
   * Ledra 側から申請を強制しない。中身の検証はルート側で許可リストと突き合わせる。
   */
  capabilities: z.array(z.string().trim().max(60)).max(10).optional(),
});
