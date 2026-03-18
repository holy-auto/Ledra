export type { PlanTier } from "@/types/billing";
import type { PlanTier } from "@/types/billing";

export function priceIdToPlanTier(priceId: string): PlanTier | null {
  const starter = process.env.STRIPE_PRICE_STARTER;
  const standard = process.env.STRIPE_PRICE_STANDARD;
  const pro = process.env.STRIPE_PRICE_PRO;
  const starterAnnual = process.env.STRIPE_PRICE_STARTER_ANNUAL;
  const standardAnnual = process.env.STRIPE_PRICE_STANDARD_ANNUAL;
  const proAnnual = process.env.STRIPE_PRICE_PRO_ANNUAL;

  // 旧 mini → starter 互換
  const mini = process.env.STRIPE_PRICE_MINI;
  if (mini && priceId === mini) return "starter";

  if (starter && priceId === starter) return "starter";
  if (standard && priceId === standard) return "standard";
  if (pro && priceId === pro) return "pro";
  if (starterAnnual && priceId === starterAnnual) return "starter";
  if (standardAnnual && priceId === standardAnnual) return "standard";
  if (proAnnual && priceId === proAnnual) return "pro";
  return null;
}

/**
 * free プランは Stripe サブスクリプション不要のため対象外。
 * plan === "free" で呼ばれた場合はエラー。
 */
export function planTierToPriceId(plan: PlanTier, annual = false): string {
  if (plan === "free") throw new Error("Free plan does not require a Stripe Price");

  const m: Record<string, string | undefined> = {
    starter: annual ? process.env.STRIPE_PRICE_STARTER_ANNUAL : process.env.STRIPE_PRICE_STARTER,
    standard: annual ? process.env.STRIPE_PRICE_STANDARD_ANNUAL : process.env.STRIPE_PRICE_STANDARD,
    pro: annual ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO,
  };
  const v = m[plan];
  if (!v) throw new Error(`Missing STRIPE_PRICE for plan: ${plan}${annual ? " (annual)" : ""}`);
  return v;
}
