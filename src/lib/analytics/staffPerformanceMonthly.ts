/**
 * 担当者別 月次実績集計 (management dashboard 用)。
 *
 * reservations を assigned_user_id 別に集計し、当月 (scheduled_date が
 * 当月内) の「完了 (status='completed')」案件の件数と estimated_amount
 * 合計を返す。display_name は auth.users (user_metadata.display_name) を
 * 参照し、無ければ email、それも無ければ user_id にフォールバック。
 *
 * @security tenantId は呼び出し元 (resolveCallerWithRole) で検証済みである
 *   こと。createTenantScopedAdmin で取得した admin は RLS を bypass する
 *   ため、全クエリで `.eq("tenant_id", tenantId)` を必須とする。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type StaffMonthlyRow = {
  user_id: string;
  display_name: string;
  completed_jobs: number;
  estimated_revenue: number;
  month: string; // "YYYY-MM"
};

export type StaffMonthlyResult = {
  staff: StaffMonthlyRow[];
  month: string; // "YYYY-MM"
};

/** "YYYY-MM" と当月の [from, toExclusive) date 文字列を組み立てる。 */
function monthRange(year: number, month: number): { label: string; from: string; toExclusive: string } {
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  // 翌月1日 (当月末日の翌日) を排他的上限にする。
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const toExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { label: `${year}-${mm}`, from, toExclusive };
}

/**
 * auth.users を listUsers でページ走査し、対象 user_id の
 * { display_name | email } を解決する。
 */
async function resolveDisplayNames(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  userIds: Set<string>,
): Promise<Map<string, { displayName: string | null; email: string | null }>> {
  const map = new Map<string, { displayName: string | null; email: string | null }>();
  if (userIds.size === 0) return map;

  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      logger.warn("staffPerformanceMonthly: listUsers failed; falling back to user_id", { error: error.message });
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
            : null;
      map.set(u.id, { displayName, email: u.email ?? null });
    }
    if (users.length < 200) break;
    page++;
  }
  return map;
}

/**
 * 当月の担当者別実績を算出する。
 *
 * - 対象: scheduled_date が当月内 かつ status='completed' かつ
 *   assigned_user_id が非 NULL の reservations。
 * - completed_jobs: 件数 / estimated_revenue: estimated_amount 合計。
 * - 件数の多い順 (同数なら売上順) にソート。
 */
export async function getStaffMonthlyPerformance(args: {
  tenantId: string;
  year: number;
  month: number;
}): Promise<StaffMonthlyResult> {
  const { label, from, toExclusive } = monthRange(args.year, args.month);
  const { admin, tenantId } = createTenantScopedAdmin(args.tenantId);

  const { data, error } = await admin
    .from("reservations")
    .select("assigned_user_id, estimated_amount")
    .eq("tenant_id", tenantId) // REQUIRED: admin bypasses RLS
    .eq("status", "completed")
    .gte("scheduled_date", from)
    .lt("scheduled_date", toExclusive);

  if (error) {
    logger.error("staffPerformanceMonthly: reservations query failed", { error: error.message });
    throw new Error(`staff-performance reservations: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ assigned_user_id: string | null; estimated_amount: number | null }>;

  // assigned_user_id 別に集計 (未割り当ては除外)。
  const agg = new Map<string, { completed_jobs: number; estimated_revenue: number }>();
  for (const r of rows) {
    const uid = r.assigned_user_id;
    if (!uid) continue;
    const cur = agg.get(uid) ?? { completed_jobs: 0, estimated_revenue: 0 };
    cur.completed_jobs += 1;
    cur.estimated_revenue += r.estimated_amount ?? 0;
    agg.set(uid, cur);
  }

  const nameMap = await resolveDisplayNames(admin, new Set(agg.keys()));

  const staff: StaffMonthlyRow[] = Array.from(agg.entries()).map(([user_id, v]) => {
    const resolved = nameMap.get(user_id);
    const display_name = resolved?.displayName ?? resolved?.email ?? user_id;
    return {
      user_id,
      display_name,
      completed_jobs: v.completed_jobs,
      estimated_revenue: v.estimated_revenue,
      month: label,
    };
  });

  // 件数の多い順 → 同数なら売上貢献の多い順。
  staff.sort((a, b) => b.completed_jobs - a.completed_jobs || b.estimated_revenue - a.estimated_revenue);

  return { staff, month: label };
}
