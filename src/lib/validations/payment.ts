import { z } from "zod";

const PAYMENT_METHODS = ["cash", "card", "qr", "bank_transfer", "other"] as const;
const PAYMENT_STATUSES = ["completed", "refunded", "partial_refund", "voided"] as const;

const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
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

export const paymentCreateSchema = z.object({
  payment_method: z.enum(PAYMENT_METHODS, { message: "invalid_payment_method" }),
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  received_amount: z.coerce.number().int().min(0, "invalid_received_amount").nullable().optional(),
  store_id: nullableUuid,
  document_id: nullableUuid,
  reservation_id: nullableUuid,
  customer_id: nullableUuid,
  register_session_id: nullableUuid,
  note: nullableText(500),
  paid_at: z.string().nullable().optional(),
});

export const paymentUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  amount: z.coerce.number().int().min(1).max(999_999_999).optional(),
  received_amount: z.coerce.number().int().min(0).nullable().optional(),
  change_amount: z.coerce.number().int().min(0).optional(),
  store_id: nullableUuid,
  document_id: nullableUuid,
  reservation_id: nullableUuid,
  customer_id: nullableUuid,
  status: z.enum(PAYMENT_STATUSES).optional(),
  refund_amount: z.coerce.number().int().min(0).optional(),
  refund_reason: nullableText(500),
  note: nullableText(500),
  paid_at: z.string().nullable().optional(),
});

export const paymentDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
