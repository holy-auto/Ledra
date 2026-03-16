import { z } from "zod";

export const invoiceCreateSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  recipient_name: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  subject: z.string().trim().max(200).nullable().optional().transform(v => v || null),
  items_json: z.any().nullable().optional(),
  subtotal: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).default("draft"),
  issued_at: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  payment_date: z.string().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional().transform(v => v || null),
  show_bank_info: z.boolean().default(false),
  show_seal: z.boolean().default(false),
  show_logo: z.boolean().default(false),
  tax_rate: z.number().min(0).max(100).nullable().optional(),
});

export const invoiceUpdateSchema = invoiceCreateSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const invoiceDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
