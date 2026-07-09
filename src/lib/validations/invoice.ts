import { z } from "zod";

const invoiceItemSchema = z.object({
  description: z.string().max(500).optional(),
  /** 品番。品目マスタ(menu_items)の item_code と紐付け、帳票作成時の検索に使う。 */
  item_code: z.string().max(60).nullable().optional(),
  quantity: z.coerce.number().min(0).optional(),
  unit: z.string().max(20).optional(),
  unit_price: z.coerce.number().min(0).optional(),
  amount: z.coerce.number().min(0).optional(),
  /** 行ごとの税率 (10/8/0)。未指定時は invoice.tax_rate 適用 */
  tax_rate: z.coerce.number().min(0).max(100).nullable().optional(),
  /** 軽減税率 (8%) 対象品目フラグ */
  is_reduced_rate: z.boolean().nullable().optional(),
  certificate_id: z.string().uuid().nullable().optional(),
  certificate_public_id: z.string().nullable().optional(),
});

export const invoiceCreateSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  recipient_name: z
    .string()
    .trim()
    .max(100)
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
  items: z.array(invoiceItemSchema.passthrough()).max(500).optional(),
  items_json: z.any().nullable().optional(),
  subtotal: z.number().min(0).default(0).optional(),
  tax: z.number().min(0).default(0).optional(),
  total: z.number().min(0).default(0).optional(),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).default("draft"),
  issued_at: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  payment_date: z.string().nullable().optional(),
  note: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  show_bank_info: z.boolean().default(false).optional(),
  show_seal: z.boolean().default(false).optional(),
  show_logo: z.boolean().default(false).optional(),
  tax_rate: z.coerce.number().min(0).max(100).nullable().optional(),
  is_invoice_compliant: z.boolean().optional(),
  invoice_number: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  vehicle_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  vehicle_info: z.any().nullable().optional(),
});

export const invoiceUpdateSchema = invoiceCreateSchema.partial().extend({
  id: z.string().uuid("missing_id"),
});

export const invoiceDeleteSchema = z.object({
  id: z.string().uuid("missing_id"),
});
