import { z } from "zod";

/**
 * スタッフシフト管理 (Staff Shift Scheduling) のバリデーションスキーマ。
 *
 * DB スキーマは supabase/migrations/20260612000024_staff_shifts.sql を参照。
 *
 * - create : 単一シフトの作成 / upsert (管理者 or 本人)
 * - update : 既存シフトの部分更新 (id 必須)
 * - bulk   : 週まとめての作成 (管理者のみ)
 */

/** YYYY-MM-DD 形式の日付文字列 */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で指定してください。");

/** HH:MM 形式の時刻文字列 (00:00〜23:59) */
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻は HH:MM 形式 (00:00〜23:59) で指定してください。");

/** 休憩時間 (分)。0 以上の整数。 */
const breakMinutes = z.coerce
  .number()
  .int("整数で指定してください。")
  .min(0, "0 以上で指定してください。")
  .max(24 * 60, "休憩時間が大きすぎます。")
  .default(60);

/** メモ (空文字 / null は null に正規化、最大200文字) */
const optionalNotes = z
  .union([z.string().trim().max(200, "メモは200文字以内で入力してください。"), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 氏名スナップショット (空文字 / null は null に正規化、最大80文字) */
const optionalStaffName = z
  .union([z.string().trim().max(80, "氏名は80文字以内で入力してください。"), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** HH:MM を分に変換して end > start を検証するための共通 refine。 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** 単一シフトの作成 / upsert。 */
export const staffShiftCreateSchema = z
  .object({
    user_id: z.string().uuid("ユーザー ID が不正です。"),
    shift_date: dateString,
    start_time: timeString,
    end_time: timeString,
    break_minutes: breakMinutes,
    notes: optionalNotes,
    staff_name: optionalStaffName,
  })
  .refine((v) => toMinutes(v.end_time) > toMinutes(v.start_time), {
    message: "終了時刻は開始時刻より後にしてください。",
    path: ["end_time"],
  });

/**
 * 既存シフトの部分更新。id 必須、その他は任意。
 * start_time / end_time の両方が指定された場合のみ end > start を検証する
 * (片方のみ更新するケースを許容するため)。
 */
export const staffShiftUpdateSchema = z
  .object({
    id: z.string().uuid("シフト ID が不正です。"),
    user_id: z.string().uuid("ユーザー ID が不正です。").optional(),
    shift_date: dateString.optional(),
    start_time: timeString.optional(),
    end_time: timeString.optional(),
    break_minutes: breakMinutes.optional(),
    notes: optionalNotes,
    staff_name: optionalStaffName,
  })
  .refine((v) => !(v.start_time && v.end_time) || toMinutes(v.end_time) > toMinutes(v.start_time), {
    message: "終了時刻は開始時刻より後にしてください。",
    path: ["end_time"],
  });

/** 週まとめての一括作成 (最大50件)。 */
export const staffShiftBulkSchema = z.object({
  shifts: z
    .array(staffShiftCreateSchema)
    .min(1, "シフトを1件以上指定してください。")
    .max(50, "一括登録は50件までです。"),
});

export type StaffShiftCreateInput = z.infer<typeof staffShiftCreateSchema>;
export type StaffShiftUpdateInput = z.infer<typeof staffShiftUpdateSchema>;
export type StaffShiftBulkInput = z.infer<typeof staffShiftBulkSchema>;
