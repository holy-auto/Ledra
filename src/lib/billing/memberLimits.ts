import type { PlanTier } from "@/lib/billing/planFeatures";

/** プラン別メンバー上限（null = 無制限） */
const LIMITS: Record<PlanTier, number | null> = {
  free: 1,
  starter: 3,
  standard: 7,
  pro: 15,
};

export function memberLimit(plan: PlanTier): number | null {
  return LIMITS[plan] ?? null;
}

export function memberLimitLabel(plan: PlanTier): string {
  const l = memberLimit(plan);
  return l === null ? "無制限" : `${l}人`;
}

export function canAddMember(plan: PlanTier, currentCount: number): boolean {
  const l = memberLimit(plan);
  if (l === null) return true;
  return currentCount < l;
}
