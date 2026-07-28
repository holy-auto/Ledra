import { z } from "zod";

/**
 * Schemas for `/api/mobile/*` (Bearer-token authenticated, called from
 * Expo apps). These are end-user mobile flows; bodies are typically thin.
 */

const NON_EMPTY = (max: number, label: string) =>
  z.string().trim().min(1, `${label}は必須です。`).max(max, `${label}は${max}文字以内で入力してください。`);

/* ─── Reservations ───────────────────────────────────────── */

export const mobileReservationCreateSchema = z.object({
  scheduled_date: NON_EMPTY(20, "予約日"),
  customer_id: z.string().uuid("顧客 ID の形式が不正です。"),
  store_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
  menu_items_json: z.unknown().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  note: z.string().trim().max(5000).optional(),
  assigned_user_id: z.string().uuid().optional(),
  estimated_amount: z.number().int().min(0).optional(),
});
export type MobileReservationCreate = z.infer<typeof mobileReservationCreateSchema>;

export const mobileReservationUpdateSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    scheduled_date: z.string().trim().max(20).optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    customer_id: z.string().uuid().optional(),
    vehicle_id: z.string().uuid().optional(),
    menu_items_json: z.unknown().optional(),
    note: z.string().trim().max(5000).optional(),
    assigned_user_id: z.string().uuid().optional(),
    store_id: z.string().uuid().optional(),
    estimated_amount: z.number().int().min(0).optional(),
    sub_status: z.string().trim().max(50).optional(),
    progress_note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "更新するフィールドを 1 つ以上指定してください。",
  });
export type MobileReservationUpdate = z.infer<typeof mobileReservationUpdateSchema>;

/* ─── Progress ───────────────────────────────────────────── */

export const mobileProgressEventSchema = z.object({
  // 任意: 未指定なら現在のワークフロー工程名を自動採用する (advance ルートと同様、
  // 職人が写真を撮って進めるだけでラベル手入力を不要にする)。
  progress_label: z.string().trim().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type MobileProgressEvent = z.infer<typeof mobileProgressEventSchema>;

/**
 * 作業開始/完了時に任意で送る出張作業場所のGPS（モバイル端末の getCurrentPosition）。
 * 位置情報が取得できない/拒否された端末では省略され、照合は no_reference のまま。
 */
export const mobileWorkGpsSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type MobileWorkGps = z.infer<typeof mobileWorkGpsSchema>;

/* ─── Push registration ──────────────────────────────────── */

export const mobilePushTokenSchema = z.object({
  token: NON_EMPTY(500, "デバイス token"),
  platform: z.enum(["ios", "android"], {
    message: "platform は ios / android のいずれかです。",
  }),
});
export type MobilePushToken = z.infer<typeof mobilePushTokenSchema>;

export const mobilePushTokenDeleteSchema = z.object({
  token: NON_EMPTY(500, "デバイス token"),
});
export type MobilePushTokenDelete = z.infer<typeof mobilePushTokenDeleteSchema>;

/* ─── Cash register open / close ─────────────────────────── */

export const mobileRegisterOpenSchema = z.object({
  opening_cash: z.number().int().min(0).max(10_000_000),
  note: z.string().trim().max(500).optional(),
});
export type MobileRegisterOpen = z.infer<typeof mobileRegisterOpenSchema>;

export const mobileRegisterCloseSchema = z.object({
  closing_cash: z.number().int().min(0).max(10_000_000),
  note: z.string().trim().max(500).optional(),
});
export type MobileRegisterClose = z.infer<typeof mobileRegisterCloseSchema>;

/* ─── NFC attach / write ─────────────────────────────────── */

export const mobileNfcAttachSchema = z.object({
  certificate_id: z.string().uuid("証明書 ID の形式が不正です。"),
});
export type MobileNfcAttach = z.infer<typeof mobileNfcAttachSchema>;

export const mobileNfcWriteSchema = z.object({
  certificate_id: z.string().uuid("証明書 ID の形式が不正です。").optional(),
  url: z.string().trim().url("URL の形式が不正です。").max(2000).optional(),
});
export type MobileNfcWrite = z.infer<typeof mobileNfcWriteSchema>;
