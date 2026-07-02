/**
 * 課金関連のテナント行 (plan_tier / is_active / stripe_subscription_id) の共有キャッシュ。
 *
 * billing guard (enforceBilling) と認証層 (resolveCallerWithRole → resolvePlanTier) の
 * 双方がテナントのプランを毎リクエスト読み込むため、ここに 60 秒キャッシュを集約して
 * 重複クエリを 1 本にする。plan 変更時は invalidateTenantBillingCache で明示的に破棄する
 * (Stripe webhook の購読同期・platform 管理の手動プラン変更から呼ぶ)。
 *
 * Stripe SDK 等の重い依存を持たない薄いモジュールにしてあるので、認証層から import しても
 * バンドルを膨らませない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCache, invalidateCache } from "@/lib/cache";

export interface TenantBillingRow {
  plan_tier: string | null;
  is_active: boolean | null;
  stripe_subscription_id: string | null;
}

function tenantBillingCacheKey(tenantId: string): string {
  return `tenant-billing:${tenantId}`;
}

/**
 * 課金関連のテナント行を 60 秒キャッシュで取得する。行が無い/エラー時は null。
 * plan 変更時に invalidateTenantBillingCache で破棄されるため、TTL は取りこぼしの保険。
 */
export async function getCachedTenantBilling(tenantId: string): Promise<TenantBillingRow | null> {
  const admin = createServiceRoleAdmin("tenant billing cache — plan_tier/is_active lookup (billing guard & auth)");
  return withCache<TenantBillingRow | null>(tenantBillingCacheKey(tenantId), 60, async () => {
    const { data, error } = await admin
      .from("tenants")
      .select("plan_tier, is_active, stripe_subscription_id")
      .eq("id", tenantId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as TenantBillingRow;
  });
}

/**
 * テナントの課金キャッシュを破棄する。冪等 (キャッシュ未生成でも安全)。
 * plan_tier / is_active を変更した直後に呼び、次リクエストで即反映させる。
 */
export async function invalidateTenantBillingCache(tenantId: string): Promise<void> {
  await invalidateCache(tenantBillingCacheKey(tenantId));
}
