import { z } from "zod";

/**
 * LINE一斉配信強化 (Segmented LINE Broadcast) のバリデーションスキーマ。
 *
 * セグメント条件で絞った顧客へ LINE 一斉配信を行う。DB スキーマは
 * supabase/migrations/20260612000010_line_broadcasts.sql を参照。
 *
 * segment_json: { segment_type, filters }
 *   - all          : line_user_id を持つ全顧客
 *   - no_visit_days : filters.days で最終来店からの経過日で絞る
 *   - vehicle_type  : filters.maker で車種(メーカー)指定
 */

export const LINE_BROADCAST_STATUSES = ["draft", "scheduled", "sending", "sent", "failed", "cancelled"] as const;
export type LineBroadcastStatus = (typeof LINE_BROADCAST_STATUSES)[number];

export const LINE_BROADCAST_STATUS_LABEL: Record<LineBroadcastStatus, string> = {
  draft: "下書き",
  scheduled: "予約済み",
  sending: "配信中",
  sent: "配信済み",
  failed: "失敗",
  cancelled: "キャンセル",
};

export const LINE_SEGMENT_TYPES = ["all", "no_visit_days", "vehicle_type"] as const;
export type LineSegmentType = (typeof LINE_SEGMENT_TYPES)[number];

export const LINE_SEGMENT_TYPE_LABEL: Record<LineSegmentType, string> = {
  all: "全顧客",
  no_visit_days: "未来店N日以上",
  vehicle_type: "車種指定",
};

/**
 * セグメント条件。segment_type ごとに必要な filters を持つ。
 *  - all          : filters なし
 *  - no_visit_days : filters.days (1 以上の整数) が必須
 *  - vehicle_type  : filters.maker (非空文字) が必須
 */
export const segmentSchema = z.discriminatedUnion("segment_type", [
  z.object({ segment_type: z.literal("all") }),
  z.object({
    segment_type: z.literal("no_visit_days"),
    filters: z.object({
      days: z.coerce
        .number()
        .int("日数は整数で指定してください。")
        .min(1, "日数は 1 以上で指定してください。")
        .max(3650, "日数が大きすぎます。"),
    }),
  }),
  z.object({
    segment_type: z.literal("vehicle_type"),
    filters: z.object({
      maker: z.string().trim().min(1, "メーカー名を指定してください。").max(60),
    }),
  }),
]);

export type LineBroadcastSegment = z.infer<typeof segmentSchema>;

/** 空文字 / undefined を null に正規化する nullable な ISO 日時 */
const optionalDateTime = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const lineBroadcastCreateSchema = z.object({
  name: z.string().trim().min(1, "配信名は必須です。").max(120),
  message_text: z
    .string()
    .trim()
    .min(1, "メッセージ本文は必須です。")
    .max(500, "メッセージは 500 文字以内で入力してください。"),
  segment_json: segmentSchema.default({ segment_type: "all" }),
  scheduled_at: optionalDateTime,
});

/**
 * PATCH: フィールド更新 / ステータス遷移。
 * 許可するステータス遷移は route 側で検証する
 * (draft→scheduled / draft→cancelled / scheduled→cancelled)。
 */
export const lineBroadcastUpdateSchema = z.object({
  id: z.string().uuid("配信 ID が不正です。"),
  name: z.string().trim().min(1, "配信名は必須です。").max(120).optional(),
  message_text: z
    .string()
    .trim()
    .min(1, "メッセージ本文は必須です。")
    .max(500, "メッセージは 500 文字以内で入力してください。")
    .optional(),
  segment_json: segmentSchema.optional(),
  scheduled_at: optionalDateTime,
  status: z.enum(LINE_BROADCAST_STATUSES).optional(),
});

export type LineBroadcastCreateInput = z.infer<typeof lineBroadcastCreateSchema>;
export type LineBroadcastUpdateInput = z.infer<typeof lineBroadcastUpdateSchema>;
