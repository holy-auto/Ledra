import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeRole, type Role } from "@/lib/auth/roles";
import { normalizePlanTier, type PlanTier } from "@/lib/billing/planFeatures";

/** 認証済みユーザーのテナント情報 */
export type CallerContext = {
  userId: string;
  tenantId: string;
  role: Role;
  planTier: PlanTier;
};

/** テナント情報のみ（プラン不要な場合） */
export type CallerBasic = {
  userId: string;
  tenantId: string;
};

/** Supabase Admin クライアント取得 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

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

/**
 * ログインユーザーのテナント情報を解決する（基本情報のみ）
 */
export async function resolveCallerBasic(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CallerBasic | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
  };
}
