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

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

/** スキルタグ配列: 各タグは 1〜40 文字、最大 30 個。空文字は除去。 */
const skillsArray = z
  .array(z.string().trim().min(1).max(40))
  .max(30)
  .optional()
  .transform((v) => {
    if (!v) return [] as string[];
    // 重複除去 + 空除去（順序保持）
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of v) {
      const t = s.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out;
  });

const nullableRate = z
  .number()
  .min(0)
  .max(1)
  .nullable()
  .optional()
  .transform((v) => (v == null || isNaN(v) ? null : v));

export const staffCreateSchema = z.object({
  name: z.string().trim().min(1, "名前は必須です。").max(100),
  kind: z.enum(["internal", "external"]).default("internal"),
  user_id: nullableUuid,
  email: nullableText(200),
  phone: nullableText(50),
  skills: skillsArray,
  color: nullableText(20),
  note: nullableText(1000),
  is_active: z.boolean().default(true),
  /** レス率（0〜1）。外注請求書の金額自動計算に使うデフォルト値。 */
  commission_rate: nullableRate,
});

export const staffUpdateSchema = staffCreateSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const staffDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

/** 1 件のシフト。 */
const shiftItemSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください"),
  start_time: nullableText(8),
  end_time: nullableText(8),
  note: nullableText(200),
});

/**
 * 指定スタッフの今後のシフトを一括置換する。
 * （サーバ側で当該 staff の未来分シフトを削除 → 受け取った配列を再挿入）
 */
export const shiftsPutSchema = z.object({
  staff_id: z.string().uuid("無効なIDです。"),
  shifts: z.array(shiftItemSchema).max(200),
});
