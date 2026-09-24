import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import type { InsurerPlanTier, InsurerRole } from "@/types/insurer";
import { normalizeInsurerPlanTier, normalizeInsurerRole, INSURER_PLAN_RANK } from "@/types/insurer";
import { setSentryInsurerContext } from "@/lib/sentryContext";

const ACTIVE_INSURER_COOKIE = "active_insurer_id";

export type InsurerStatus = "active" | "active_pending_review" | "suspended";

/**
 * 保険会社が「使える」状態の集合。**停止（suspended）だけを外す。**
 *
 * ここが唯一の定義源。同じ規則が DB 側にも2つある
 * （`public.current_insurer_access()` と `public.my_insurer_ids()`）ので、
 * **変えるときは3箇所を揃える**こと。
 *
 * 揃っていなかった実例（2026-09-21 に修正）: `/api/insurer/switch` の GET が
 * `status = 'active'` だけを見ており、**審査中（active_pending_review）の保険会社が
 * 切替リストに出てこなかった**。同じファイルの POST は逆に `insurers` を一切見ず、
 * 停止中でもクッキーを設定できた。1つの規則を3箇所に別々に書いた結果。
 */
export const INSURER_USABLE_STATUSES = ["active", "active_pending_review"] as const satisfies readonly InsurerStatus[];

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

  const admin = createServiceRoleAdmin("insurerAuth — resolves insurer_id from user session, pre-resolution");

  // Check for active insurer cookie
  const cookieStore = await cookies();
  const activeInsurerId = cookieStore.get(ACTIVE_INSURER_COOKIE)?.value;

  // Fetch ALL active memberships (oldest first) — never narrow by cookie here.
  // Picking a single row before checking insurer usability was the bug: a
  // cookie-pinned but suspended insurer would win the query, then get rejected
  // by the status filter, and the user was locked out even though another
  // usable insurer existed. Resolve usability across all memberships instead.
  const { data: memberships, error: iuErr } = await admin
    .from("insurer_users")
    .select("id, insurer_id, role")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (iuErr || !memberships?.length) return null;

  // Which of those insurers are usable (active/active_pending_review, not suspended)?
  const insurerIds = memberships.map((m) => m.insurer_id);
  const { data: insurers, error: insErr } = await admin
    .from("insurers")
    .select("id, plan_tier, status")
    .in("id", insurerIds)
    .eq("is_active", true)
    .in("status", [...INSURER_USABLE_STATUSES]);

  if (insErr) return null;

  const usableById = new Map((insurers ?? []).map((i) => [i.id, i]));

  // Prefer the cookie-pinned insurer when it is both a membership and usable;
  // otherwise fall back to the oldest membership whose insurer is usable.
  const pinned =
    activeInsurerId && usableById.has(activeInsurerId)
      ? memberships.find((m) => m.insurer_id === activeInsurerId)
      : undefined;
  const chosen = pinned ?? memberships.find((m) => usableById.has(m.insurer_id));
  if (!chosen) return null;

  const insurer = usableById.get(chosen.insurer_id);
  if (!insurer) return null;

  const ctx: InsurerCallerContext = {
    userId: auth.user.id,
    insurerId: chosen.insurer_id,
    insurerUserId: chosen.id,
    role: normalizeInsurerRole(chosen.role),
    planTier: normalizeInsurerPlanTier(insurer.plan_tier),
    insurerStatus: insurer.status as InsurerStatus,
  };

  setSentryInsurerContext({ userId: auth.user.id, insurerId: chosen.insurer_id });

  return ctx;
}

/**
 * Enforce insurer plan tier for a given action.
 * Returns a Response if access is denied, or null if allowed.
 */
export function enforceInsurerPlan(caller: InsurerCallerContext, minPlan: InsurerPlanTier): Response | null {
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
      },
    );
  }
  return null;
}
