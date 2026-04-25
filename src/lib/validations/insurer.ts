import { z } from "zod";

const PLAN_TIERS = ["basic", "pro", "enterprise"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const insurerAccountUpdateSchema = z.object({
  contact_email: z.string().trim().email("無効なメールアドレスです。").max(254).optional(),
  contact_phone: optionalText(40),
  address: optionalText(500),
});

export const insurerBillingCreateSchema = z.object({
  plan_tier: z.enum(PLAN_TIERS, { message: "無効なプランです。" }).optional(),
});

export const insurerNotificationsMarkReadSchema = z.object({
  ids: z.array(z.string().uuid("無効なIDです。")).max(500).optional(),
  all: z.boolean().optional(),
});

export const insurerPiiDisclosureSchema = z.object({
  certificate_id: z.string().uuid("Missing certificate_id"),
  reason: optionalText(2000),
});

const RULE_CONDITION_TYPES = ["category", "tenant", "priority"] as const;

export const insurerRuleCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required.").max(200),
  condition_type: z.enum(RULE_CONDITION_TYPES, {
    message: "condition_type must be one of: category, tenant, priority.",
  }),
  condition_value: z.string().trim().min(1, "condition_value is required.").max(200),
  assign_to: z.string().uuid("assign_to is required."),
  is_active: z.boolean().optional(),
});

export const insurerRuleUpdateSchema = z.object({
  id: z.string().uuid("id is required."),
  name: z.string().trim().min(1).max(200).optional(),
  condition_type: z.enum(RULE_CONDITION_TYPES).optional(),
  condition_value: z.string().trim().min(1).max(200).optional(),
  assign_to: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

export const insurerSavedSearchCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  query: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  status_filter: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  date_from: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional()
    .transform((v) => v || null),
  date_to: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const insurerSavedSearchDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

const IP_CIDR_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const VALID_TIMEOUTS = [15, 30, 60, 120] as const;

export const insurerSecurityUpdateSchema = z.object({
  ip_whitelist_enabled: z.boolean().optional(),
  ip_whitelist: z
    .array(
      z
        .string()
        .trim()
        .refine((v) => IP_CIDR_PATTERN.test(v), {
          message: "無効なIP/CIDRフォーマットです。",
        }),
    )
    .max(200)
    .optional(),
  session_timeout_minutes: z
    .number()
    .int()
    .refine((v) => (VALID_TIMEOUTS as readonly number[]).includes(v), {
      message: `セッションタイムアウトは ${VALID_TIMEOUTS.join("/")} 分のいずれかを指定してください。`,
    })
    .optional(),
});

export const insurerSettingsUpdateSchema = z.object({
  preferences: z.record(z.string(), z.boolean()),
});

const positiveHours = z.number().positive("must be a positive number.").max(8760);

export const insurerSlaUpdateSchema = z
  .object({
    urgent: positiveHours.optional(),
    high: positiveHours.optional(),
    normal: positiveHours.optional(),
    low: positiveHours.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one SLA value must be provided.",
  });

export const insurerSwitchSchema = z.object({
  insurer_id: z.string().uuid("無効なIDです。"),
});

const TEMPLATE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const insurerTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required.").max(200),
  title_template: z.string().trim().min(1, "title_template is required.").max(500),
  category: nullableText(100),
  default_priority: z.enum(TEMPLATE_PRIORITIES).optional(),
  description_template: nullableText(5000),
});

const INSURER_USER_ROLES = ["admin", "viewer", "auditor"] as const;

export const insurerUserInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("メールアドレスは必須です。").max(254),
  role: z.enum(INSURER_USER_ROLES, {
    message: "ロールは admin / viewer / auditor のいずれかを指定してください。",
  }),
  display_name: z.string().trim().max(100).optional(),
});

export const insurerUserUpdateSchema = z.object({
  insurer_user_id: z.string().uuid("insurer_user_id is required"),
  role: z.enum(INSURER_USER_ROLES).optional(),
  is_active: z.boolean().optional(),
});

export const insurerUserDeleteSchema = z.object({
  insurer_user_id: z.string().uuid("insurer_user_id is required"),
});

export const insurerWatchlistCreateSchema = z.object({
  type: z.enum(["certificate", "vehicle"], { message: "type must be 'certificate' or 'vehicle'." }),
  target_id: z.string().uuid("target_id is required."),
});
