import { z } from "zod";

const PAYMENT_METHODS = ["cash", "card", "qr", "bank_transfer", "other"] as const;

const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効なIDです。",
  });

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const posCheckoutSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  tax_rate: z.coerce.number().int().min(0, "invalid_tax_rate").max(100, "invalid_tax_rate").default(10),
  payment_method: z.enum(PAYMENT_METHODS, { message: "invalid_payment_method" }).default("cash"),
  received_amount: z.coerce.number().int().min(0).nullable().optional(),
  reservation_id: nullableUuid,
  customer_id: nullableUuid,
  store_id: nullableUuid,
  register_session_id: nullableUuid,
  items_json: z.any().optional(),
  note: nullableText(500),
  create_receipt: z.boolean().optional(),
});

export const posCheckoutSessionSchema = z.object({
  amount: z.coerce.number().int().min(1).max(999_999_999),
  customer_id: nullableUuid,
  reservation_id: nullableUuid,
  store_id: nullableUuid,
  register_session_id: nullableUuid,
  description: z.string().trim().max(500).optional(),
});

export const posQrSessionSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  reservation_id: z.string().uuid("reservation_id and tenant_id are required"),
  tenant_id: z.string().uuid("reservation_id and tenant_id are required"),
  store_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const posTerminalCaptureSchema = z.object({
  payment_intent_id: z
    .string()
    .trim()
    .min(1, "invalid_payment_intent_id")
    .max(200)
    .refine((v) => v.startsWith("pi_"), { message: "invalid_payment_intent_id" }),
  reservation_id: nullableUuid,
  customer_id: nullableUuid,
  store_id: nullableUuid,
  register_session_id: nullableUuid,
  items_json: z.any().optional(),
  tax_rate: z.coerce.number().int().min(0).max(100).default(10),
  note: nullableText(500),
});

export const posTerminalPaymentIntentSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  currency: z.string().trim().min(1).max(10).default("jpy"),
  description: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const posTerminalProcessSchema = z.object({
  payment_intent_id: z.string().trim().min(1, "payment_intent_id は必須です").max(200),
  reader_id: z.string().trim().min(1, "reader_id は必須です").max(100),
});
