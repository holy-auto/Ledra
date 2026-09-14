import type Stripe from "stripe";

/**
 * Stripe SDK v20+ で `current_period_end` が `Subscription` から
 * `SubscriptionItem` へ移った（API version `2026-02-25.clover`）。
 * 型定義上は `Subscription` に残っていないため `unknown` 経由で読み、
 * 無ければ先頭アイテムの `current_period_end` にフォールバックする。
 *
 * `src/app/api/stripe/webhook/route.ts` と `src/lib/billing/guard.ts` の
 * 両方が必要とする（E2-1: guard 側がこのフォールバックを持たず、
 * items 側にしか値が無い場合に課金猶予が計算されず即ブロックしていた）。
 */
export function getCurrentPeriodEnd(sub: Stripe.Subscription | null | undefined): number | null {
  if (!sub) return null;
  const subRecord = sub as unknown as Record<string, unknown>;
  return (subRecord.current_period_end as number | undefined) ?? sub.items?.data?.[0]?.current_period_end ?? null;
}
