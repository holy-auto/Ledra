import { z } from "zod";

/**
 * 顧客ランク (Customer Loyalty Rank) のバリデーションスキーマ。
 *
 * - customer_rank_rules はテナントごとのランク定義。
 * - rank_order は 1 = 最高ランク。(tenant_id, rank_order) は DB で unique。
 * - badge_color は CustomerRankBadge が解釈する tailwind 系の色名。
 */

const BADGE_COLORS = ["gray", "yellow", "blue", "purple"] as const;

/** ランク作成 */
export const customerRankCreateSchema = z.object({
  rank_name: z.string().trim().min(1, "ランク名を入力してください。").max(40),
  rank_order: z.coerce
    .number()
    .int("表示順は整数で入力してください。")
    .min(1, "表示順は1以上を入力してください。")
    .max(99),
  min_visits: z.coerce
    .number()
    .int("来店回数は整数で入力してください。")
    .min(0, "来店回数は0以上を入力してください。")
    .max(100_000)
    .default(0),
  min_total_spend: z.coerce
    .number()
    .int("累計売上は整数で入力してください。")
    .min(0, "累計売上は0以上を入力してください。")
    .max(9_999_999_999)
    .default(0),
  badge_color: z.enum(BADGE_COLORS, { message: "無効なバッジ色です。" }).default("gray"),
});

/** ランク更新 (id 必須 + 各項目は任意) */
export const customerRankUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  rank_name: z.string().trim().min(1, "ランク名を入力してください。").max(40).optional(),
  rank_order: z.coerce
    .number()
    .int("表示順は整数で入力してください。")
    .min(1, "表示順は1以上を入力してください。")
    .max(99)
    .optional(),
  min_visits: z.coerce
    .number()
    .int("来店回数は整数で入力してください。")
    .min(0, "来店回数は0以上を入力してください。")
    .max(100_000)
    .optional(),
  min_total_spend: z.coerce
    .number()
    .int("累計売上は整数で入力してください。")
    .min(0, "累計売上は0以上を入力してください。")
    .max(9_999_999_999)
    .optional(),
  badge_color: z.enum(BADGE_COLORS, { message: "無効なバッジ色です。" }).optional(),
});

/** ランク削除 (query param 経由で id を受けるが、念のためスキーマも用意) */
export const customerRankDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

export type CustomerRankCreateInput = z.infer<typeof customerRankCreateSchema>;
export type CustomerRankUpdateInput = z.infer<typeof customerRankUpdateSchema>;
