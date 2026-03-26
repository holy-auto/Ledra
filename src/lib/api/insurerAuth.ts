import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InsurerPlanTier, InsurerRole } from "@/types/insurer";
import { normalizeInsurerPlanTier, normalizeInsurerRole, INSURER_PLAN_RANK } from "@/types/insurer";

const ACTIVE_INSURER_COOKIE = "active_insurer_id";

export type InsurerStatus = "active" | "active_pending_review" | "suspended";

export type InsurerCallerContext = {
  userId: string;
  insurerId: string;
  insurerUserId: string;
  role: InsurerRole;
  planTier: InsurerPlanTier;
  /** Current insurer status */
  insurerStatus: InsurerStatus;
};

/**
 * Resolve the current user's insurer context from Supabase session.
 * Uses `active_insurer_id` cookie to support multi-insurer switching.
 * Returns null if the user is not authenticated or not an insurer user.
 */
export async function resolveInsurerCaller(): Promise<InsurerCallerContext | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const admin = createAdminClient();

  // Check for active insurer cookie
  const cookieStore = await cookies();
  const activeInsurerId = cookieStore.get(ACTIVE_INSURER_COOKIE)?.value;

  // Build query for insurer_user record
  let query = admin
    .from("insurer_users")
    .select("id, insurer_id, role")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  if (activeInsurerId) {
    // Try specific insurer first
    query = query.eq("insurer_id", activeInsurerId);
  }

  const { data: iu, error: iuErr } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // If cookie-specified insurer not found, fall back to any
  if (!iu && activeInsurerId) {
    const { data: fallbackIu } = await admin
      .from("insurer_users")
      .select("id, insurer_id, role")
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!fallbackIu) return null;
    // Use fallback and continue
    return resolveInsurerContext(admin, auth.user.id, fallbackIu);
  }

  if (iuErr || !iu) return null;

  return resolveInsurerContext(admin, auth.user.id, iu);
}

async function resolveInsurerContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  iu: { id: string; insurer_id: string; role: string },
): Promise<InsurerCallerContext | null> {
  // Get insurer plan info — allow active and active_pending_review (not suspended)
  const { data: insurer, error: insErr } = await admin
    .from("insurers")
    .select("plan_tier, status")
    .eq("id", iu.insurer_id)
    .eq("is_active", true)
    .in("status", ["active", "active_pending_review"])
    .limit(1)
    .maybeSingle();

  if (insErr || !insurer) return null;

  return {
    userId,
    insurerId: iu.insurer_id,
    insurerUserId: iu.id,
    role: normalizeInsurerRole(iu.role),
    planTier: normalizeInsurerPlanTier(insurer.plan_tier),
    insurerStatus: insurer.status as InsurerStatus,
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
