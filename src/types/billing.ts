export type PlanTier = "free" | "starter" | "standard" | "pro";
export const PLAN_RANK: Record<PlanTier, number> = { free: 0, starter: 1, standard: 2, pro: 3 };
