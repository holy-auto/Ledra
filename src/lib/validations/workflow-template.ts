import { z } from "zod";

const SERVICE_TYPES = ["coating", "ppf", "wrapping", "body_repair", "other"] as const;

const stepSchema = z.object({
  order: z.coerce.number().int().min(0),
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  is_customer_visible: z.boolean(),
  estimated_min: z.coerce.number().int().min(0).default(0),
});

export const workflowTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, "テンプレート名は必須です").max(200),
  service_type: z.enum(SERVICE_TYPES, { message: "無効なサービスタイプです" }).default("other"),
  steps: z.array(stepSchema).min(1, "ステップは1つ以上必要です").max(50),
  is_default: z.boolean().default(false),
});

export const workflowTemplateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  steps: z.array(stepSchema).min(1).max(50).optional(),
  is_default: z.boolean().optional(),
});
