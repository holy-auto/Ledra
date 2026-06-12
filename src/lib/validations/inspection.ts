import { z } from "zod";

/**
 * デジタル点検表 (Digital Inspection Checklist) のバリデーションスキーマ。
 *
 * 入庫 / 納車時に車両状態を構造化チェックリストで記録する。DB スキーマは
 * supabase/migrations/20260612000018_inspection_checklists.sql を参照。
 */

export const INSPECTION_ITEM_TYPES = ["ok_ng", "text", "numeric"] as const;
export type InspectionItemType = (typeof INSPECTION_ITEM_TYPES)[number];

export const INSPECTION_ITEM_TYPE_LABEL: Record<InspectionItemType, string> = {
  ok_ng: "○/×/△",
  text: "テキスト",
  numeric: "数値",
};

export const INSPECTION_TYPES = ["intake", "delivery", "periodic"] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  intake: "入庫点検",
  delivery: "納車前点検",
  periodic: "定期点検",
};

/** 空文字 / undefined を null に正規化する nullable uuid */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 空文字 / null を null に正規化する nullable text */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);

/** 点検項目 1 件 */
export const inspectionTemplateItemSchema = z.object({
  id: z.string().uuid("項目 ID の形式が不正です。"),
  label: z.string().trim().min(1, "項目名は必須です。").max(100, "項目名が長すぎます。"),
  type: z.enum(INSPECTION_ITEM_TYPES),
});
export type InspectionTemplateItem = z.infer<typeof inspectionTemplateItemSchema>;

export const inspectionTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, "テンプレート名は必須です。").max(80),
  items: z.array(inspectionTemplateItemSchema).max(50, "項目は最大 50 件までです。").default([]),
  is_default: z.boolean().default(false),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
});
export type InspectionTemplateCreateInput = z.infer<typeof inspectionTemplateCreateSchema>;

export const inspectionTemplateUpdateSchema = z.object({
  id: z.string().uuid("テンプレート ID が不正です。"),
  name: z.string().trim().min(1, "テンプレート名は必須です。").max(80).optional(),
  items: z.array(inspectionTemplateItemSchema).max(50, "項目は最大 50 件までです。").optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
});
export type InspectionTemplateUpdateInput = z.infer<typeof inspectionTemplateUpdateSchema>;

/**
 * 回答 1 件: { value: string|boolean, note?: string }。
 * value は ok_ng なら "ok"|"ng"|"na" 等の文字列、text/numeric なら文字列を想定するが、
 * boolean も許容する (将来の項目タイプ追加に備える)。
 */
const inspectionAnswerSchema = z.object({
  value: z.union([z.string().max(2000), z.boolean(), z.null()]).optional(),
  note: z.union([z.string().trim().max(1000), z.null()]).optional(),
});

/** answers: { [item_id]: { value, note? } } */
const inspectionAnswersSchema = z.record(z.string(), inspectionAnswerSchema).default({});

/** photo_urls: data URL もしくは Storage URL の文字列配列 (最大 20) */
const photoUrlsSchema = z
  .array(z.string().max(5_000_000, "画像データが大きすぎます。"))
  .max(20, "写真は最大 20 枚までです。")
  .default([]);

/** ISO 文字列の inspected_at (任意) */
const optionalIso = z
  .union([z.string().datetime({ offset: true }), z.string().datetime(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const inspectionRecordCreateSchema = z.object({
  template_id: optionalUuid,
  reservation_id: optionalUuid,
  vehicle_id: optionalUuid,
  customer_id: optionalUuid,
  inspection_type: z.enum(INSPECTION_TYPES).default("intake"),
  answers: inspectionAnswersSchema,
  photo_urls: photoUrlsSchema,
  inspector_name: optionalText(80),
  inspected_at: optionalIso,
  notes: optionalText(2000),
});
export type InspectionRecordCreateInput = z.infer<typeof inspectionRecordCreateSchema>;

export const inspectionRecordUpdateSchema = z.object({
  id: z.string().uuid("点検記録 ID が不正です。"),
  template_id: optionalUuid,
  reservation_id: optionalUuid,
  vehicle_id: optionalUuid,
  customer_id: optionalUuid,
  inspection_type: z.enum(INSPECTION_TYPES).optional(),
  answers: z.record(z.string(), inspectionAnswerSchema).optional(),
  photo_urls: z
    .array(z.string().max(5_000_000, "画像データが大きすぎます。"))
    .max(20, "写真は最大 20 枚までです。")
    .optional(),
  inspector_name: optionalText(80),
  inspected_at: optionalIso,
  notes: optionalText(2000),
});
export type InspectionRecordUpdateInput = z.infer<typeof inspectionRecordUpdateSchema>;
