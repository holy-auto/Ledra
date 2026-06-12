import { z } from "zod";

/**
 * スタッフ勤怠管理 (Staff Attendance / Time Card) のバリデーションスキーマ。
 *
 * DB スキーマは supabase/migrations/20260612000020_attendance.sql を参照。
 *
 * - clock-in: 出勤打刻 (今日のレコードを作成)
 * - clock-out: 退勤打刻 (clock_out / break_minutes / note を更新)
 * - admin upsert: 管理者による手動の追加/編集 (全フィールド指定可)
 */

/** YYYY-MM-DD 形式の日付文字列 */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で指定してください。");

/** ISO 8601 形式のタイムスタンプ文字列 (空文字 / null は null に正規化) */
const optionalIsoTimestamp = z
  .union([z.string().datetime({ offset: true }), z.string().datetime(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 休憩時間 (分)。0 以上の整数。 */
const breakMinutes = z.coerce
  .number()
  .int("整数で指定してください。")
  .min(0, "0 以上で指定してください。")
  .max(24 * 60, "休憩時間が大きすぎます。")
  .default(0);

/** メモ (空文字 / null は null に正規化、最大200文字) */
const optionalNote = z
  .union([z.string().trim().max(200, "メモは200文字以内で入力してください。"), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 出勤打刻。work_date は省略時サーバ側で今日を採用。 */
export const attendanceClockInSchema = z.object({
  work_date: dateString.optional(),
  note: optionalNote,
});

/** 退勤打刻。clock_out 省略時はサーバ側で now() を採用。 */
export const attendanceClockOutSchema = z.object({
  id: z.string().uuid("勤怠 ID が不正です。"),
  clock_out: optionalIsoTimestamp,
  break_minutes: breakMinutes,
  note: optionalNote,
});

/** 管理者による手動 upsert (追加/編集)。全フィールド指定可。 */
export const attendanceAdminUpsertSchema = z.object({
  user_id: z.string().uuid("ユーザー ID が不正です。"),
  work_date: dateString,
  clock_in: optionalIsoTimestamp,
  clock_out: optionalIsoTimestamp,
  break_minutes: breakMinutes,
  note: optionalNote,
  staff_name: z
    .union([z.string().trim().max(80, "氏名は80文字以内で入力してください。"), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
});

export type AttendanceClockInInput = z.infer<typeof attendanceClockInSchema>;
export type AttendanceClockOutInput = z.infer<typeof attendanceClockOutSchema>;
export type AttendanceAdminUpsertInput = z.infer<typeof attendanceAdminUpsertSchema>;
