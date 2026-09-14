import { z } from "zod";

/** Reusable email validator */
export const emailSchema = z.string().trim().toLowerCase().email("有効なメールアドレスを入力してください");

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
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+$/);

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

/** V2: Extended join schema with terms, corporate info, business_type */
export const joinSchemaV2 = z
  .object({
    business_type: z
      .enum(["corporation", "sole_proprietor"], {
        error: "事業形態を選択してください",
      })
      .default("corporation"),
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
  })
  .refine((data) => data.business_type !== "corporation" || data.corporate_number !== "", {
    message: "法人の場合、法人番号は必須です",
    path: ["corporate_number"],
  });

export const contactSchema = z.object({
  name: z.string().trim().min(1, "お名前は必須です"),
  email: emailSchema,
  company: z.string().trim().optional(),
  category: z.string().trim().min(1, "カテゴリは必須です"),
  message: z.string().trim().min(1, "お問い合わせ内容は必須です"),
});

/** Marketing lead (資料DL・デモ・お問い合わせ・ROI・メルマガ等の統合受信) */
export const marketingLeadSchema = z.object({
  source: z.enum([
    "document_dl",
    "document_shop",
    "document_agent",
    "document_insurer",
    "demo",
    "contact",
    "newsletter",
    "roi",
    "pilot",
    "other",
  ]),
  resource_key: z.string().trim().max(120).optional(),
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(200).optional(),
  role: z.string().trim().max(120).optional(),
  email: emailSchema,
  phone: z.string().trim().max(40).optional(),
  industry: z.string().trim().max(120).optional(),
  locations: z.string().trim().max(40).optional(),
  timing: z.string().trim().max(40).optional(),
  message: z.string().trim().max(4000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  consent: z.literal(true, { error: "同意が必要です" }),
  referrer: z.string().trim().max(500).optional(),
  utm_source: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(120).optional(),
  utm_term: z.string().trim().max(120).optional(),
  utm_content: z.string().trim().max(120).optional(),
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

export const requestCodeSchema = z
  .object({
    tenant_slug: z.string().trim().min(1, "tenant_slug is required"),
    email: z.string().trim().min(1, "email is required"),
    last4: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "last4 must be 4 digits")
      .optional(),
    phone_last4: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "phone_last4 must be 4 digits")
      .optional(),
  })
  .refine((data) => data.last4 || data.phone_last4, { message: "last4 or phone_last4 is required" });

/** Agent application form */
export const agentApplicationSchema = z.object({
  company_name: z.string().trim().min(1, "会社名は必須です"),
  contact_name: z.string().trim().min(1, "担当者名は必須です"),
  email: emailSchema,
  phone: z.string().trim().min(1, "電話番号は必須です"),
  address: z.string().trim().min(1, "住所は必須です"),
  industry: z.string().trim().optional().default(""),
  qualifications: z.string().trim().optional().default(""),
  track_record: z.string().trim().optional().default(""),
  documents: z
    .array(
      z.object({
        name: z.string(),
        storage_path: z.string(),
        content_type: z.string(),
        file_size: z.number(),
      }),
    )
    .default([]),
  terms_accepted: z.boolean({ error: "利用規約への同意が必要です" }),
});

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
