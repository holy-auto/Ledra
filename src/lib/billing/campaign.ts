import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanTier } from "@/types/billing";

export interface CampaignResult {
  slug: string;
  /** Stripe Coupon ID（duration_in_months: 12 で作成済み前提） */
  stripeCouponId: string;
  /** 初期費用を免除するか */
  waiveSetupFee: boolean;
}

const LAUNCH_100_SLUG = "launch_100";

/** プランごとの Coupon 環境変数マッピング */
const COUPON_ENV_MAP: Partial<Record<PlanTier, string>> = {
  standard: "STRIPE_COUPON_LAUNCH_100_STANDARD",
  pro: "STRIPE_COUPON_LAUNCH_100_PRO",
};

/**
 * テナントがキャンペーン対象かどうかを判定し、適用すべきCoupon情報を返す。
 *
 * 判定ロジック:
 * 1. 対象プランかチェック（launch_100 は standard / pro が対象）
 * 2. テナントが既にキャンペーン適用済みでないかチェック
 * 3. 先着枠が残っているかチェック（自社DB管理）
 *
 * Coupon は Stripe ダッシュボードで事前作成:
 *   - Standard: campaign_launch_100_standard (¥10,000/月OFF, 12ヶ月)
 *   - Pro:      campaign_launch_100_Pro (割引額は別途設定, 12ヶ月)
 *
 * 枠の確定は invoice.paid webhook で行う（楽観的ロック）。
 */
export async function resolveCampaign(
  supabase: SupabaseClient,
  tenantId: string,
  planTier: PlanTier,
): Promise<CampaignResult | null> {
  // 対象プランの Coupon 環境変数を取得
  const envKey = COUPON_ENV_MAP[planTier];
  if (!envKey) return null; // starter / free は対象外

  const couponId = process.env[envKey];
  if (!couponId) return null; // キャンペーン未設定

  // 既にキャンペーン適用済みか
  const { data: tenant } = await supabase
    .from("tenants")
    .select("campaign_slug")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenant?.campaign_slug === LAUNCH_100_SLUG) {
    // 再契約の場合でも適用済みならスキップ
    return null;
  }

  // 先着枠チェック（standard + pro で合算）
  const { count, error } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("campaign_slug", LAUNCH_100_SLUG);

  if (error) throw error;

  const maxSlots = Number(process.env.CAMPAIGN_LAUNCH_100_MAX_SLOTS ?? 100);
  if ((count ?? 0) >= maxSlots) return null;

  return {
    slug: LAUNCH_100_SLUG,
    stripeCouponId: couponId,
    waiveSetupFee: true,
  };
}

/**
 * invoice.paid webhook から呼び出し、キャンペーン枠を確定する。
 * checkout.session.completed の metadata.campaign_slug を参照。
 */
export async function confirmCampaignSlot(
  supabase: SupabaseClient,
  tenantId: string,
  campaignSlug: string | null | undefined,
): Promise<void> {
  if (!campaignSlug) return;

  const { error } = await supabase
    .from("tenants")
    .update({ campaign_slug: campaignSlug })
    .eq("id", tenantId)
    .is("campaign_slug", null); // 楽観的ロック：未設定の場合のみ書き込み

  if (error) {
    console.warn("campaign slot confirmation failed (may already be set)", { tenantId, campaignSlug, error });
  }
}
