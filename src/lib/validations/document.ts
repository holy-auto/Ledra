import { z } from "zod";

const docTypes = [
  "estimate",
  "delivery",
  "purchase_order",
  "order_confirmation",
  "inspection",
  "receipt",
  "invoice",
  "consolidated_invoice",
] as const;
const docStatuses = ["draft", "sent", "accepted", "paid", "rejected", "cancelled"] as const;
const honorifics = ["御中", "様", ""] as const;

export const documentCreateSchema = z.object({
  doc_type: z.enum(docTypes, { message: "無効な帳票タイプです。" }),
  customer_id: z.string().uuid().nullable().optional(),
  recipient_name: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  recipient_honorific: z.enum(honorifics).optional(),
  recipient_postal_code: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => v || null),
  recipient_address: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => v || null),
  recipient_phone: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => v || null),
  subject: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v || null),
  period_start: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  period_end: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  payment_terms: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v || null),
  delivery_date: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  template_id: z.string().uuid().nullable().optional(),
  items_json: z.any().nullable().optional(),
  subtotal: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
  status: z.enum(docStatuses).default("draft"),
  issued_at: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  note: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  is_invoice_compliant: z.boolean().default(false),
  source_document_id: z.string().uuid().nullable().optional(),
  show_bank_info: z.boolean().default(false),
  show_seal: z.boolean().default(false),
  show_logo: z.boolean().default(false),
  tax_rate: z.coerce.number().min(0).max(100).nullable().optional(),
  doc_number: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  items: z.array(z.any()).max(500).optional(),
  meta_json: z.any().nullable().optional(),
});

export const documentUpdateSchema = documentCreateSchema.partial().extend({
  id: z.string().uuid("id is required"),
});

export const documentDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
