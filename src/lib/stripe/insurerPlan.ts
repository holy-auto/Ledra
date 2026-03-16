import type { InsurerPlanTier } from "@/types/insurer";

/**
 * Maps Stripe Price IDs to insurer plan tiers.
 * Uses separate env vars from tenant plans.
 */
export function insurerPriceIdToPlanTier(priceId: string): InsurerPlanTier | null {
  const basic = process.env.STRIPE_INSURER_PRICE_BASIC;
  const pro = process.env.STRIPE_INSURER_PRICE_PRO;
  const enterprise = process.env.STRIPE_INSURER_PRICE_ENTERPRISE;

  if (basic && priceId === basic) return "basic";
  if (pro && priceId === pro) return "pro";
  if (enterprise && priceId === enterprise) return "enterprise";
  return null;
}

export function insurerPlanTierToPriceId(plan: InsurerPlanTier): string {
  const m: Record<InsurerPlanTier, string | undefined> = {
    basic: process.env.STRIPE_INSURER_PRICE_BASIC,
    pro: process.env.STRIPE_INSURER_PRICE_PRO,
    enterprise: process.env.STRIPE_INSURER_PRICE_ENTERPRISE,
  };
  const v = m[plan];
  if (!v) throw new Error(`Missing STRIPE_INSURER_PRICE for plan: ${plan}`);
  return v;
}
