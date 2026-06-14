/**
 * 供給パートナー関連の zod スキーマ (route とテストで共有)。
 *
 * 発注 API のエンドポイントは SSRF / 平文送信を避けるため https のみ許可する。
 */
import { z } from "zod";

/** 発注 API エンドポイント: https の絶対 URL のみ。 */
export const supplyApiEndpointSchema = z
  .string()
  .trim()
  .url("URL の形式が不正です。")
  .max(500)
  .refine((u) => u.startsWith("https://"), "API エンドポイントは https のみ指定できます。");

export const supplyApiAuthTypeSchema = z.enum(["none", "api_key", "bearer", "oauth2"]);

/** パートナー新規登録 (本人が owner として登録)。 */
export const supplyRegisterSchema = z.object({
  name: z.string().trim().min(1, "事業者名は必須です。").max(120),
  contact_email: z.string().trim().email("メールアドレスの形式が不正です。").max(200).nullable().optional(),
  contact_phone: z.string().trim().max(40).nullable().optional(),
});

/** プロフィール / API 設定 / 鍵の更新。 */
export const supplyProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  contact_email: z.string().trim().email("メールアドレスの形式が不正です。").max(200).nullable().optional(),
  contact_phone: z.string().trim().max(40).nullable().optional(),
  api_endpoint: supplyApiEndpointSchema.nullable().optional(),
  api_auth_type: supplyApiAuthTypeSchema.optional(),
  // 鍵: 文字列を渡すと更新、null で消去、未指定 (undefined) なら据え置き。
  api_key: z.string().trim().max(2000).nullable().optional(),
  api_secret: z.string().trim().max(2000).nullable().optional(),
});

/** 商材カタログの 1 行。 */
export const supplyProductSchema = z.object({
  sku: z.string().trim().min(1, "品番は必須です。").max(80),
  name: z.string().trim().min(1, "商品名は必須です。").max(200),
  category: z.string().trim().max(80).nullable().optional(),
  list_price: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().trim().length(3).default("JPY"),
  stock_status: z.string().trim().max(40).nullable().optional(),
  lead_time_days: z.coerce.number().int().min(0).max(365).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const supplyProductUpdateSchema = supplyProductSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const supplyProductDeleteSchema = z.object({ id: z.string().uuid("無効なIDです。") });

/** メーカーがポータルで発注に回答する (受注 / 一部欠品 / 辞退)。 */
export const supplyPortalRespondSchema = z
  .object({
    action: z.enum(["accept", "partial", "decline"]),
    // partial 時の行ごとの受注数量。accept/decline では無視される。
    lines: z
      .array(
        z.object({
          item_id: z.string().uuid("無効な明細IDです。"),
          accepted_quantity: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
        }),
      )
      .max(500)
      .optional(),
    decline_reason: z
      .enum(["discontinued", "out_of_stock", "price_mismatch", "min_lot", "other"])
      .nullable()
      .optional(),
    // 出荷予定日 (YYYY-MM-DD)。受注時に任意。
    ship_eta: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "出荷予定日は YYYY-MM-DD 形式で入力してください。")
      .nullable()
      .optional(),
    tracking_no: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.action !== "decline" || !!v.decline_reason, {
    message: "辞退する場合は理由を選択してください。",
    path: ["decline_reason"],
  });
