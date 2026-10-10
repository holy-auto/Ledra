import { z } from "zod";

/**
 * 自由入力の1列。**`.transform()` を付けてはいけない。**
 *
 * かつて `.optional().transform((v) => v || null)` だった。transform は
 * ZodOptional の外側に乗るので **キーを送らなくても走り**、`undefined || null`
 * で `null` になる。PUT の通常更新は「`undefined` のキーは触らない」
 * （`route.ts` の `if (v !== undefined)`）で部分更新を実現しているため、
 * 省いた列が全部 `null` で上書きされる —— 18列分の入力が消える。
 *
 * 今これを踏む呼び出し元は無い（PUT を叩くのは `link_customer` と、
 * `status: "completed"` を送って zod に 400 で弾かれている
 * `BrandingHearingClient.handleComplete` の2つだけ。実測 2026-10-10）。
 * つまり踏んでいないだけで、`status` を1つ直せば発火する。
 *
 * 空文字→null の詰め替えは POST 側の `toEmpty` が担う（DB の既存慣例は空文字）。
 *
 * `.nullable()` も外した。明示的な `null` を通すと、PUT の通常更新がそれをそのまま書き、
 * `hearings.customer_name` は**本番で NOT NULL（既定 `''`）**なので 23502 → 500 になる
 * （本番の `information_schema` で確認・2026-10-10）。入力の誤りは 500 ではなく 400 で返す。
 */
const textField = (max: number) => z.string().trim().max(max).optional();

const hearingStatuses = ["draft", "confirmed", "linked", "archived"] as const;

/** DB CHECK に依存する自由入力カラム群。個別制約は DB 側。 */
const hearingFieldsShape = {
  customer_name: textField(100),
  customer_phone: textField(40),
  customer_email: textField(120),
  vehicle_maker: textField(80),
  vehicle_model: textField(80),
  vehicle_year: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  vehicle_plate: textField(40),
  vehicle_color: textField(40),
  vehicle_vin: textField(40),
  service_type: textField(40),
  vehicle_size: textField(40),
  coating_history: textField(1000),
  desired_menu: textField(1000),
  budget_range: textField(80),
  concern_areas: textField(500),
  scratches_dents: textField(500),
  parking_environment: textField(200),
  usage_frequency: textField(200),
  additional_requests: textField(1000),
  hearing_json: z.any().nullable().optional(),
};

export const hearingCreateSchema = z.object(hearingFieldsShape);

export const hearingUpdateSchema = z
  .object({
    id: z.string().uuid("無効なIDです。"),
    status: z.enum(hearingStatuses).optional(),
    ...hearingFieldsShape,
  })
  .extend({
    // 顧客連携などの特殊アクション
    action: z.enum(["link_customer"]).optional(),
  });
