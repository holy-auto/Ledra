import { z } from "zod";
import { isStaffQualificationKey, STAFF_QUALIFICATIONS, type StaffQualificationKey } from "@/lib/staff/qualifications";

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

/**
 * 法定資格キー配列。skills と違い**統制語彙**なので、集合外のキーは **fail-closed で弾く**
 * （正準キーは src/lib/staff/qualifications.ts）。各要素を refine で検証するので、残る transform は
 * 重複除去だけ（未知キーはここに届かない）。max は業務上限ではなくペイロード上限で、正規化前に
 * 効くため正準 3 件に重複が混じっても弾かれないよう緩め（重複は下の dedup が畳む）。
 */
const qualificationsArray = z
  .array(z.string().trim().refine(isStaffQualificationKey, { message: "未知の資格キーです。" }))
  .max(STAFF_QUALIFICATIONS.length * 4)
  .optional()
  .transform((v) => (v ? ([...new Set(v)] as StaffQualificationKey[]) : []));

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
  qualifications: qualificationsArray,
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
