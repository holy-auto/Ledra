import { z } from "zod";

/** Reusable email validator */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("有効なメールアドレスを入力してください");

/** Password: 8+ chars, upper, lower, digit */
export const passwordSchema = z
  .string()
  .min(8, "パスワードは8文字以上で入力してください")
  .regex(/[A-Z]/, "パスワードに大文字を1文字以上含めてください")
  .regex(/[a-z]/, "パスワードに小文字を1文字以上含めてください")
  .regex(/[0-9]/, "パスワードに数字を1文字以上含めてください");

/** Phone last 4 digits */
export const last4Schema = z.string().regex(/^\d{4}$/, "電話番号下4桁は4桁の数字で入力してください");

/** Slug (alphanumeric + hyphen) */
export const slugSchema = z.string().trim().min(1).regex(/^[a-z0-9-]+$/);

// ─── API route schemas ───

/** @deprecated Use joinSchemaV2 instead */
export const joinSchema = z.object({
  company_name: z.string().trim().min(1, "会社名は必須です"),
  contact_person: z.string().trim().min(1, "担当者名は必須です"),
  email: emailSchema,
  phone: z.string().trim().optional().default(""),
  password: passwordSchema,
  requested_plan: z.enum(["basic", "standard", "pro"]).default("basic"),
});

/** V2: Extended join schema with terms, corporate info */
export const joinSchemaV2 = z.object({
  company_name: z.string().trim().min(1, "会社名は必須です"),
  contact_person: z.string().trim().min(1, "担当者名は必須です"),
  email: emailSchema,
  phone: z.string().trim().optional().default(""),
  password: passwordSchema,
  requested_plan: z.enum(["basic", "pro", "enterprise"]).default("basic"),
  corporate_number: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  representative_name: z.string().trim().optional().default(""),
  terms_accepted: z.boolean({ error: "利用規約への同意が必要です" }),
  referral_code: z.string().trim().max(100).optional(),
  agency_id: z.string().uuid("agency_idはUUID形式である必要があります").optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1, "お名前は必須です"),
  email: emailSchema,
  company: z.string().trim().optional(),
  category: z.string().trim().min(1, "カテゴリは必須です"),
  message: z.string().trim().min(1, "お問い合わせ内容は必須です"),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1, "顧客名は必須です"),
  name_kana: z.string().trim().optional().default(""),
  email: z.string().trim().email("有効なメールアドレスを入力してください").optional().or(z.literal("")),
  phone: z.string().trim().optional().default(""),
  postal_code: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  note: z.string().trim().optional().default(""),
});

export const requestCodeSchema = z.object({
  tenant_slug: z.string().trim().min(1, "tenant_slug is required"),
  email: z.string().trim().min(1, "email is required"),
  last4: z.string().trim().regex(/^\d{4}$/, "last4 must be 4 digits").optional(),
  phone_last4: z.string().trim().regex(/^\d{4}$/, "phone_last4 must be 4 digits").optional(),
}).refine(
  (data) => data.last4 || data.phone_last4,
  { message: "last4 or phone_last4 is required" },
);

/**
 * Parse and validate request body with a Zod schema.
 * Returns { success: true, data } or { success: false, errors: string[] }
 */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true as const, data: result.data };
  }
  const errors = result.error.issues.map((i) => i.message);
  return { success: false as const, errors };
}
