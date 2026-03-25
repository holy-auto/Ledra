import { cookies } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeRole, type Role } from "@/lib/auth/roles";
import { normalizePlanTier, type PlanTier } from "@/lib/billing/planFeatures";

const ACTIVE_TENANT_COOKIE = "active_tenant_id";

/** 認証済みユーザーのテナント情報 */
export type CallerContext = {
  userId: string;
  tenantId: string;
  role: Role;
  planTier: PlanTier;
};

/** Supabase Admin クライアント取得 */
export { getSupabaseAdmin as getAdminClient } from "@/lib/supabase/admin";

/**
 * Read the active_tenant_id cookie.
 * Returns null if not set or if cookies() throws (e.g. non-request context).
 */
async function getActiveTenantCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve membership for the user, respecting the active_tenant_id cookie.
 * If the cookie is set and user is a member, use that tenant.
 * Otherwise falls back to the first membership.
 */
async function resolveMembership(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  fields: string,
): Promise<Record<string, any> | null> {
  const activeTenantId = await getActiveTenantCookie();

  // If cookie is set, try that tenant first
  if (activeTenantId) {
    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select(fields)
      .eq("user_id", userId)
      .eq("tenant_id", activeTenantId)
      .limit(1)
      .maybeSingle();

    if (mem && typeof mem === "object" && "tenant_id" in mem) return mem as Record<string, any>;
  }

  // Fallback: first membership (ordered by created_at)
  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select(fields)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (mem && typeof mem === "object" && "tenant_id" in mem) return mem as Record<string, any>;
  return null;
}

/**
 * ログインユーザーのテナント情報を解決する（プラン・ロール付き）
 * null を返す場合は認証/テナント未割当
 */
export async function resolveCallerFull(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CallerContext | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const mem = await resolveMembership(supabase, userRes.user.id, "tenant_id, role");
  if (!mem?.tenant_id) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan_tier")
    .eq("id", mem.tenant_id)
    .single();

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
    role: normalizeRole(mem.role),
    planTier: normalizePlanTier(tenant?.plan_tier),
  };
}

