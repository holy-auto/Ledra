import { z } from "zod";

const optionalSlug = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .optional()
  .transform((v) => v || null);

const optionalShortStr = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => v || null);

export const portalRequestCodeSchema = z.object({
  email: z.string().trim().email("invalid_email").max(254),
  phone_last4: z.string().trim().max(40).optional(),
  last4: z.string().trim().max(40).optional(),
  preferred_tenant_slug: optionalSlug,
  tenant: optionalSlug,
  from: optionalShortStr,
  public_id: optionalShortStr,
  pid: optionalShortStr,
});

export const portalVerifyCodeSchema = z.object({
  email: z.string().trim().email("invalid_email").max(254),
  phone_last4: z.string().trim().max(40).optional(),
  last4: z.string().trim().max(40).optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "invalid_code"),
  preferred_tenant_slug: optionalSlug,
  tenant: optionalSlug,
});
