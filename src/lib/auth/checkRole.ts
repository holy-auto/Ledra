import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRole, hasMinRole, type Role } from "./roles";
import { hasPermission, type Permission } from "./permissions";

export type CallerInfo = {
  userId: string;
  tenantId: string;
  role: Role;
};

/**
 * Resolve the current user's tenant and role.
 * Returns null if not authenticated or not a member.
 */
export async function resolveCallerWithRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CallerInfo | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
    role: normalizeRole(mem.role),
  };
}

/**
 * Check if the caller meets the minimum role requirement.
 */
export function requireMinRole(caller: CallerInfo, minRole: Role): boolean {
  return hasMinRole(caller.role, minRole);
}

/**
 * Check if the caller has a specific permission.
 */
export function requirePermission(caller: CallerInfo, perm: Permission): boolean {
  return hasPermission(caller.role, perm);
}
