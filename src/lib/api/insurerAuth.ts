import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InsurerPlanTier, InsurerRole } from "@/types/insurer";
import { normalizeInsurerPlanTier, normalizeInsurerRole, INSURER_PLAN_RANK } from "@/types/insurer";

export type InsurerCallerContext = {
  userId: string;
  insurerId: string;
  insurerUserId: string;
  role: InsurerRole;
  planTier: InsurerPlanTier;
};

/**
 * Resolve the current user's insurer context from Supabase session.
 * Returns null if the user is not authenticated or not an insurer user.
 */
export async function resolveInsurerCaller(): Promise<InsurerCallerContext | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const admin = createAdminClient();

  // Get insurer_user record
  const { data: iu, error: iuErr } = await admin
    .from("insurer_users")
    .select("id, insurer_id, role")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (iuErr || !iu) return null;

  // Get insurer plan info
  const { data: insurer, error: insErr } = await admin
    .from("insurers")
    .select("plan_tier")
    .eq("id", iu.insurer_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (insErr || !insurer) return null;

  return {
    userId: auth.user.id,
    insurerId: iu.insurer_id,
    insurerUserId: iu.id,
    role: normalizeInsurerRole(iu.role),
    planTier: normalizeInsurerPlanTier(insurer.plan_tier),
  };
}

/**
 * Enforce insurer plan tier for a given action.
 * Returns a Response if access is denied, or null if allowed.
 */
export function enforceInsurerPlan(
  caller: InsurerCallerContext,
  minPlan: InsurerPlanTier
): Response | null {
  if (INSURER_PLAN_RANK[caller.planTier] < INSURER_PLAN_RANK[minPlan]) {
    return new Response(
      JSON.stringify({
        error: "Plan restricted",
        message: `この機能は保険会社${minPlan}プラン以上で利用できます。`,
        current_plan: caller.planTier,
      }),
      {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }
  return null;
}
