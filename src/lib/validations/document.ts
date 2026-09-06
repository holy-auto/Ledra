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
  "staff_invoice",
] as const;
const docStatuses = ["draft", "sent", "accepted", "paid", "overdue", "rejected", "cancelled"] as const;
const honorifics = ["御中", "様", ""] as const;

/**
 * 明細は `items`（下記）で受け取り、`calcItems()` が保存形へ変換する。
 * **このファイルに明細行のスキーマは持たない。**
 *
 * かつて `documentItemSchema` と `items_json` フィールドがここにあったが、
 * 実際に保存・読込される形と**完全に非互換**だった（2026-09-04 に削除）。
 *
 * | | 旧 `documentItemSchema` | 実データ（`calcItems()` / `@/types/document`） |
 * |---|---|---|
 * | 行種別 | `type`: line / subtotal / heading / note | `item_type`: item / heading / subtotal |
 * | 名称 | `name`（必須・min 1） | `description` |
 * | 税区分 | `tax_category`: "standard" / "reduced" / "exempt" | `tax_category`: 数値 10 / 8 |
 * | 金額 | 持たない | `amount` |
 *
 * ルートは `input.items` しか読まず `items_json` を無視していたので無害だったが、
 * `items_json` を使う経路に切り替えた瞬間に全明細が弾かれる地雷だった。
 * あわせて `@/types/document` と同名の `DocumentItem` を別定義していた名前衝突も解消した。
 *
 * 明細行の型が要るときは `@/types/document` の `DocumentItem` を使うこと。
 */
export const documentCreateSchema = z.object({
  doc_type: z.enum(docTypes, { message: "無効な帳票タイプです。" }),
  customer_id: z.string().uuid().nullable().optional(),
  /** 外注請求書 (doc_type=staff_invoice) の宛先となる外注職人。 */
  staff_member_id: z.string().uuid().nullable().optional(),
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
  subtotal: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
  status: z.enum(docStatuses).default("draft"),
  issued_at: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  payment_date: z.string().nullable().optional(),
  vehicle_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  vehicle_info: z.any().nullable().optional(),
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
  /** 明細の単価が税込か否か。true なら unit_price はそれぞれ税込で入力された値として扱う */
  is_tax_inclusive: z.boolean().default(false),
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
  // 注意: Zod の .partial() は default を剥がさない（ZodOptional(ZodDefault) は
  // キー欠落時に inner default を適用する）。更新では「送っていない項目は触らない」が
  // 正なので、default を持つフィールドを default 無しの optional に上書きする。
  // これを怠ると status のみの更新でも show_*/is_invoice_compliant/is_tax_inclusive が
  // false として parse 結果に現れ、PUT の isContentEdit 判定（!== undefined）が誤発火して
  // 「送付済みの請求書は内容を編集できません」で入金済等への変更がブロックされる。
  // また status の default("draft") が漏れると、status 未指定の内容更新で送付済み帳票が
  // draft に巻き戻る二次バグにもなる。
  status: z.enum(docStatuses).optional(),
  subtotal: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  is_invoice_compliant: z.boolean().optional(),
  show_bank_info: z.boolean().optional(),
  show_seal: z.boolean().optional(),
  show_logo: z.boolean().optional(),
  is_tax_inclusive: z.boolean().optional(),
});

export const documentDeleteSchema = z
  .object({
    id: z.string().uuid("無効なIDです。").optional(),
    ids: z.array(z.string().uuid()).min(1).max(500).optional(),
  })
  .refine((v) => Boolean(v.id) || Boolean(v.ids?.length), { message: "削除対象を指定してください。" });
