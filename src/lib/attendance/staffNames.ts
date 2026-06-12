/**
 * 勤怠管理向けのスタッフ氏名解決ヘルパー。
 *
 * auth.users (user_metadata.display_name / full_name) を listUsers で走査し、
 * 無ければ email、それも無ければ user_id にフォールバックする。
 * staffPerformanceMonthly.ts の resolveDisplayNames と同じ方針。
 *
 * @security tenantId は呼び出し元 (resolveCallerWithRole) で検証済みである
 *   こと。createTenantScopedAdmin で取得した admin は RLS を bypass するため、
 *   tenant_memberships は必ず `.eq("tenant_id", tenantId)` でスコープする。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

type ScopedAdmin = ReturnType<typeof createTenantScopedAdmin>["admin"];

export type StaffMember = {
  user_id: string;
  display_name: string;
};

/**
 * テナントメンバー (tenant_memberships) の user_id 一覧を取得し、
 * 表示名を解決して返す。
 */
export async function listTenantStaff(admin: ScopedAdmin, tenantId: string): Promise<StaffMember[]> {
  const { data: memberships, error } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId);

  if (error) {
    logger.warn("attendance listTenantStaff: memberships query failed", { error: error.message });
    return [];
  }

  const userIds = new Set<string>((memberships ?? []).map((m) => (m as { user_id: string }).user_id));
  const nameMap = await resolveStaffNames(admin, userIds);

  return Array.from(userIds).map((user_id) => ({
    user_id,
    display_name: nameMap.get(user_id) ?? user_id,
  }));
}

/**
 * 指定 user_id 集合の表示名を解決する。
 * display_name | full_name | email | user_id の優先順位。
 */
export async function resolveStaffNames(admin: ScopedAdmin, userIds: Set<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.size === 0) return map;

  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      logger.warn("attendance resolveStaffNames: listUsers failed; falling back to user_id", {
        error: error.message,
      });
      break;
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (!userIds.has(u.id)) continue;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const displayName =
        typeof meta.display_name === "string" && meta.display_name.trim()
          ? (meta.display_name as string)
          : typeof meta.full_name === "string" && meta.full_name.trim()
            ? (meta.full_name as string)
            : (u.email ?? null);
      if (displayName) map.set(u.id, displayName);
    }
    if (users.length < 200) break;
    page++;
  }
  return map;
}

/** 単一ユーザーの表示名を解決する (clock-in 時の staff_name スナップショット用)。 */
export async function resolveSingleStaffName(admin: ScopedAdmin, userId: string): Promise<string | null> {
  const map = await resolveStaffNames(admin, new Set([userId]));
  return map.get(userId) ?? null;
}
