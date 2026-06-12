import { z } from "zod";

/**
 * SMS/メール自動配信強化 (Multi-channel Notification Broadcast) の
 * バリデーションスキーマ。
 *
 * 既存の LINE 一斉配信に SMS (Twilio) / メール (Resend→SendGrid) チャネルを
 * 加えた統合配信。DB スキーマは
 * supabase/migrations/20260612000022_notification_broadcasts.sql を参照。
 *
 * segment_json: { segment_type, filters } (line-broadcast と同形式)
 *   - all          : 当該チャネルの宛先を持つ全顧客
 *   - no_visit_days : filters.days で最終来店からの経過日で絞る
 *   - vehicle_type  : filters.maker で車種(メーカー)指定
 */

export const NOTIFICATION_CHANNELS = ["sms", "email", "line", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  sms: "SMS",
  email: "メール",
  line: "LINE",
  push: "プッシュ",
};

export const NOTIFICATION_BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
] as const;
export type NotificationBroadcastStatus = (typeof NOTIFICATION_BROADCAST_STATUSES)[number];

export const NOTIFICATION_BROADCAST_STATUS_LABEL: Record<NotificationBroadcastStatus, string> = {
  draft: "下書き",
  scheduled: "予約済み",
  sending: "配信中",
  sent: "配信済み",
  failed: "失敗",
  cancelled: "キャンセル",
};

export const NOTIFICATION_SEGMENT_TYPES = ["all", "no_visit_days", "vehicle_type"] as const;
export type NotificationSegmentType = (typeof NOTIFICATION_SEGMENT_TYPES)[number];

export const NOTIFICATION_SEGMENT_TYPE_LABEL: Record<NotificationSegmentType, string> = {
  all: "全顧客",
  no_visit_days: "未来店N日以上",
  vehicle_type: "車種指定",
};

/** チャネルごとの本文文字数上限 (UI ガイドラインと server 検証の整合用) */
export const CHANNEL_MESSAGE_MAX: Record<NotificationChannel, number> = {
  sms: 160,
  email: 2000,
  line: 500,
  push: 178,
};

/** DB 制約 (char_length <= 2000) と一致する絶対上限 */
export const MESSAGE_ABSOLUTE_MAX = 2000;

/**
 * セグメント条件。segment_type ごとに必要な filters を持つ
 * (line-broadcast の segmentSchema と同一構造)。
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

export type NotificationBroadcastSegment = z.infer<typeof segmentSchema>;

/** 空文字 / undefined を null に正規化する nullable な ISO 日時 */
const optionalDateTime = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** 空文字 / undefined を null に正規化する nullable な件名 */
const optionalSubject = z
  .union([z.string().trim().max(200, "件名は 200 文字以内で入力してください。"), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const notificationBroadcastCreateSchema = z
  .object({
    name: z.string().trim().min(1, "配信名は必須です。").max(120),
    channel: z.enum(NOTIFICATION_CHANNELS),
    subject: optionalSubject,
    message_text: z
      .string()
      .trim()
      .min(1, "メッセージ本文は必須です。")
      .max(MESSAGE_ABSOLUTE_MAX, `メッセージは ${MESSAGE_ABSOLUTE_MAX} 文字以内で入力してください。`),
    segment_json: segmentSchema.default({ segment_type: "all" }),
    scheduled_at: optionalDateTime,
  })
  .superRefine((val, ctx) => {
    // email チャネルは件名を必須とする。
    if (val.channel === "email" && !val.subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message: "メール配信には件名が必要です。",
      });
    }
    // チャネル別の本文上限を超えていないか検証する。
    const max = CHANNEL_MESSAGE_MAX[val.channel];
    if (val.message_text.length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message_text"],
        message: `${NOTIFICATION_CHANNEL_LABEL[val.channel]}は ${max} 文字以内で入力してください。`,
      });
    }
  });

/**
 * PATCH: フィールド更新 / ステータス遷移。
 * channel は作成後に変更不可 (宛先解決ロジックが変わるため)。
 * 許可するステータス遷移は route 側で検証する。
 */
export const notificationBroadcastUpdateSchema = z.object({
  id: z.string().uuid("配信 ID が不正です。"),
  name: z.string().trim().min(1, "配信名は必須です。").max(120).optional(),
  subject: optionalSubject,
  message_text: z
    .string()
    .trim()
    .min(1, "メッセージ本文は必須です。")
    .max(MESSAGE_ABSOLUTE_MAX, `メッセージは ${MESSAGE_ABSOLUTE_MAX} 文字以内で入力してください。`)
    .optional(),
  segment_json: segmentSchema.optional(),
  scheduled_at: optionalDateTime,
  status: z.enum(NOTIFICATION_BROADCAST_STATUSES).optional(),
});

export type NotificationBroadcastCreateInput = z.infer<typeof notificationBroadcastCreateSchema>;
export type NotificationBroadcastUpdateInput = z.infer<typeof notificationBroadcastUpdateSchema>;
