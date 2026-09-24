import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRole, hasMinRole, type Role } from "./roles";
import { hasPermission, type Permission } from "./permissions";
import { normalizePlanTier, type PlanTier } from "@/lib/billing/planFeatures";
import { getCachedTenantBilling } from "@/lib/billing/tenantBillingCache";
import { setSentryUserAndTenant } from "@/lib/sentryContext";

export type CallerInfo = {
  userId: string;
  tenantId: string;
  role: Role;
  planTier: PlanTier;
};

const ACTIVE_TENANT_COOKIE = "active_tenant_id";

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/**
 * tenant_id を UUID のみに正規化する。万一 DB/クッキー由来の値に不可視文字
 * （空白・制御文字等）が混入しても、PostgREST の等値比較が外れて「データがあるのに
 * 0件」になる事故を防ぐ。UUID が取れなければ trim した文字列を返す。
 */
function normalizeTenantId(value: unknown): string {
  const s = String(value ?? "");
  return s.match(UUID_RE)?.[0] ?? s.trim();
}

async function getActiveTenantCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * ユーザーの「選択中テナント」の所属（tenant_id と role）を解決する。
 * active_tenant_id Cookie のテナントに所属していればそれを、無ければ最も古い所属を返す。
 *
 * Cookie セッションを持たない経路（Stripe 系のように access_token で本人確認し、
 * service role で引くもの）でも同じ規則でテナントを決めるために切り出してある。
 * 最初の所属を `limit(1)` で引くと、複数テナント所属のユーザーが別テナントを選んでいても
 * 任意の所属テナントを操作してしまう（2026-09-24 に課金 API で是正）。
 */
export async function resolveActiveMembership(
  client: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<{ tenantId: string; role: Role } | null> {
  const activeTenantId = await getActiveTenantCookie();

  if (activeTenantId) {
    const { data: mem, error } = await client
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .eq("tenant_id", activeTenantId)
      .limit(1)
      .maybeSingle();
    // 問い合わせの失敗を「所属なし」と読んで最も古い所属へ落ちると、別テナントを操作してしまう
    if (error) throw error;
    if (mem?.tenant_id) return { tenantId: normalizeTenantId(mem.tenant_id), role: normalizeRole(mem.role) };
  }

  const { data: mem, error } = await client
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!mem?.tenant_id) return null;
  return { tenantId: normalizeTenantId(mem.tenant_id), role: normalizeRole(mem.role) };
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

  // 問い合わせ失敗時は別テナントへ落とさず「解決できない」として止める（呼び出し元は null を 401 等で扱う）
  const mem = await resolveActiveMembership(supabase, userRes.user.id).catch((): null => null);
  if (!mem) return null;

  const ctx: CallerInfo = {
    userId: userRes.user.id,
    tenantId: mem.tenantId,
    role: mem.role,
    planTier: await resolvePlanTier(mem.tenantId),
  };
  setSentryUserAndTenant(ctx);
  return ctx;
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
