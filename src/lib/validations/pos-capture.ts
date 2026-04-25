import { z } from "zod";

const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効なIDです。",
  });

export const posTerminalCaptureSchema = z.object({
  payment_intent_id: z.string().trim().min(1).max(200),
  reservation_id: nullableUuid,
  customer_id: nullableUuid,
  store_id: nullableUuid,
  register_session_id: nullableUuid,
  items_json: z.any().optional(),
  tax_rate: z.coerce.number().int().min(0).max(100).default(10),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
});
