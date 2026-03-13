export type { PlanTier } from "@/types/billing";
import type { PlanTier } from "@/types/billing";

export function priceIdToPlanTier(priceId: string): PlanTier | null {
  const mini = process.env.STRIPE_PRICE_MINI;
  const standard = process.env.STRIPE_PRICE_STANDARD;
  const pro = process.env.STRIPE_PRICE_PRO;

  if (mini && priceId === mini) return "mini";
  if (standard && priceId === standard) return "standard";
  if (pro && priceId === pro) return "pro";
  return null;
}

export function planTierToPriceId(plan: PlanTier): string {
  const m: Record<PlanTier, string | undefined> = {
    mini: process.env.STRIPE_PRICE_MINI,
    standard: process.env.STRIPE_PRICE_STANDARD,
    pro: process.env.STRIPE_PRICE_PRO,
  };
  const v = m[plan];
  if (!v) throw new Error(`Missing STRIPE_PRICE for plan: ${plan}`);
  return v;
}
