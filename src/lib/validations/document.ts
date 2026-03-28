import { z } from "zod";

const docTypes = ["estimate", "delivery", "purchase_order", "order_confirmation", "inspection", "receipt", "invoice", "consolidated_invoice"] as const;
const docStatuses = ["draft", "sent", "accepted", "paid", "rejected", "cancelled"] as const;

const documentItemSchema = z.object({
  description: z.string().optional().default(""),
  quantity: z.union([z.string(), z.number()]).optional().default(0),
  unit_price: z.union([z.string(), z.number()]).optional().default(0),
  tax_category: z.string().nullable().optional(),
  certificate_id: z.string().nullable().optional(),
  certificate_public_id: z.string().nullable().optional(),
});

export const documentCreateSchema = z.object({
  doc_type: z.enum(docTypes, { message: "無効な帳票タイプです。" }),
  doc_number: z.string().trim().max(50).optional(),
  customer_id: z.string().trim().nullable().optional(),
  recipient_name: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  items: z.array(documentItemSchema).default([]),
  status: z.enum(docStatuses).default("draft"),
  issued_at: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional().transform(v => v || null),
  is_invoice_compliant: z.boolean().default(false),
  source_document_id: z.string().uuid().nullable().optional(),
  show_bank_info: z.boolean().default(false),
  show_seal: z.boolean().default(false),
  show_logo: z.boolean().default(true),
  tax_rate: z.union([z.string(), z.number()]).optional().default(10),
  meta_json: z.record(z.string(), z.unknown()).optional().default({}),
});

export const documentUpdateSchema = documentCreateSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const documentDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
