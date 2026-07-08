import { cookies } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRole, hasMinRole, type Role } from "./roles";
import { hasPermission, type Permission } from "./permissions";
import { normalizePlanTier, type PlanTier } from "@/lib/billing/planFeatures";
import { getCachedTenantBilling } from "@/lib/billing/tenantBillingCache";

export type CallerInfo = {
  userId: string;
  tenantId: string;
  role: Role;
  planTier: PlanTier;
};

const ACTIVE_TENANT_COOKIE = "active_tenant_id";

async function getActiveTenantCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current user's tenant and role.
 * Respects the active_tenant_id cookie for multi-tenant users.
 * Returns null if not authenticated or not a member.
 */
export async function resolveCallerWithRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CallerInfo | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const activeTenantId = await getActiveTenantCookie();

  // If cookie is set, try that tenant first
  if (activeTenantId) {
    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", userRes.user.id)
      .eq("tenant_id", activeTenantId)
      .limit(1)
      .maybeSingle();

    if (mem?.tenant_id) {
      const planTier = await resolvePlanTier(mem.tenant_id as string);
      return {
        userId: userRes.user.id,
        tenantId: mem.tenant_id as string,
        role: normalizeRole(mem.role),
        planTier,
      };
    }
  }

  // Fallback: first membership
  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userRes.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  const planTier = await resolvePlanTier(mem.tenant_id as string);

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
    role: normalizeRole(mem.role),
    planTier,
  };
}

/**
 * 認証済みユーザの id のみを解決する (テナント membership 不要)。
 * 本社専用ユーザ (organization_users にのみ所属し tenant_memberships を持たない)
 * でも通る。組織スコープの API は本ヘルパー + resolveOrgAccess で認可する。
 */
export async function resolveUserId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * テナントの plan_tier を取得して正規化する。
 * billing guard と共有の 60 秒キャッシュ (tenantBillingCache) を使い、認証のたびに走る
 * plan_tier の重複クエリを 1 本に集約する。呼び出し元は tenantId のメンバーであることを
 * 直前に確認済みのため、service-role 経由の tenant 行読み取りは安全。
 */
async function resolvePlanTier(tenantId: string): Promise<PlanTier> {
  try {
    const row = await getCachedTenantBilling(tenantId);
    return normalizePlanTier(row?.plan_tier ?? null);
  } catch {
    return "free";
  }
}

/** role フィールドを持つ任意のオブジェクト（CallerInfo / MobileCallerInfo 両対応） */
type WithRole = { role: Role };

/**
 * Check if the caller meets the minimum role requirement.
 * Accepts both CallerInfo and MobileCallerInfo (only `role` is used).
 */
export function requireMinRole(caller: WithRole, minRole: Role): boolean {
  return hasMinRole(caller.role, minRole);
}

/**
 * Check if the caller has a specific permission.
 * Accepts both CallerInfo and MobileCallerInfo (only `role` is used).
 */
export function requirePermission(caller: WithRole, perm: Permission): boolean {
  return hasPermission(caller.role, perm);
}
