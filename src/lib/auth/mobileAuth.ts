import type { NextRequest } from "next/server";
import { createMobileClient } from "@/lib/supabase/mobile-server";
import { normalizeRole, type Role } from "./roles";

export type MobileCaller = {
  userId: string;
  tenantId: string;
  role: Role;
  supabase: ReturnType<typeof createMobileClient> & {};
};

/**
 * Resolve the mobile caller from Bearer token.
 * Returns null if not authenticated or not a tenant member.
 */
export async function resolveMobileCaller(
  request: NextRequest
): Promise<MobileCaller | null> {
  const supabase = createMobileClient(request);
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: user.id,
    tenantId: mem.tenant_id as string,
    role: normalizeRole(mem.role),
    supabase,
  };
}
