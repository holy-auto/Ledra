/**
 * Staff performance analytics — server-side aggregation.
 *
 * Wraps the `staff_performance_stats` PG RPC and enriches the
 * resulting rows with display info from auth.users + tenant
 * membership role.
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type AnalyticsWindow = "30d" | "90d" | "365d" | "all";

export const ANALYTICS_WINDOW_LABEL: Record<AnalyticsWindow, string> = {
  "30d": "過去30日",
  "90d": "過去90日",
  "365d": "過去1年",
  all: "全期間",
};

export function windowToSince(window: AnalyticsWindow): Date | null {
  const days = window === "30d" ? 30 : window === "90d" ? 90 : window === "365d" ? 365 : null;
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type RpcRow = {
  user_id: string;
  cert_count: number | string; // bigint comes back as string in some drivers
  cert_anchored_count: number | string;
  avg_authenticity_grade: number | null;
  review_count: number | string;
  avg_review_rating: number | null;
  reservations_completed: number | string;
  reservations_cancelled: number | string;
  avg_work_minutes: number | null;
  distinct_customers: number | string;
  returning_customers: number | string;
};

export type StaffPerformanceRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  cert_count: number;
  cert_anchored_count: number;
  anchor_rate: number | null;
  avg_authenticity_grade: number | null;
  review_count: number;
  avg_review_rating: number | null;
  reservations_completed: number;
  reservations_cancelled: number;
  reservation_close_rate: number | null;
  avg_work_minutes: number | null;
  distinct_customers: number;
  returning_customers: number;
  repeat_rate: number | null;
};

export type StaffPerformanceResult = {
  window: AnalyticsWindow;
  since: string | null;
  staff: StaffPerformanceRow[];
  totals: {
    staff_with_activity: number;
    total_cert_count: number;
    total_reservations_completed: number;
    total_reviews: number;
  };
};

function toNum(v: number | string): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Compute staff performance for the given tenant + window.
 *
 * Caller MUST have already verified tenant membership via
 * resolveCallerWithRole — this function trusts tenantId.
 */
export async function getStaffPerformance(args: {
  tenantId: string;
  window: AnalyticsWindow;
}): Promise<StaffPerformanceResult> {
  const since = windowToSince(args.window);
  const { admin } = createTenantScopedAdmin(args.tenantId);

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("staff_performance_stats", {
    p_tenant_id: args.tenantId,
    p_since: since ? since.toISOString() : null,
  });

  if (rpcErr) {
    logger.error("staff_performance_stats RPC failed", { error: rpcErr.message });
    throw new Error(`staff_performance_stats: ${rpcErr.message}`);
  }

  const rpcRows = (rpcRaw as RpcRow[] | null) ?? [];

  // Enrich with auth.users + membership role.
  const [{ data: usersData }, { data: memberships }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("tenant_memberships").select("user_id, role").eq("tenant_id", args.tenantId),
  ]);

  const userMap = new Map(
    ((usersData?.users ?? []) as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).map(
      (u) => [u.id, u],
    ),
  );
  const roleMap = new Map(
    ((memberships ?? []) as Array<{ user_id: string; role: string | null }>).map((m) => [m.user_id, m.role]),
  );

  const enriched: StaffPerformanceRow[] = rpcRows.map((r) => {
    const u = userMap.get(r.user_id);
    const meta = u?.user_metadata as Record<string, unknown> | undefined;
    const certCount = toNum(r.cert_count);
    const anchored = toNum(r.cert_anchored_count);
    const distinct = toNum(r.distinct_customers);
    const returning = toNum(r.returning_customers);
    const completed = toNum(r.reservations_completed);
    const cancelled = toNum(r.reservations_cancelled);
    return {
      user_id: r.user_id,
      email: u?.email ?? null,
      display_name: (meta?.display_name as string | undefined) ?? null,
      role: roleMap.get(r.user_id) ?? null,
      cert_count: certCount,
      cert_anchored_count: anchored,
      anchor_rate: safeRate(anchored, certCount),
      avg_authenticity_grade: r.avg_authenticity_grade,
      review_count: toNum(r.review_count),
      avg_review_rating: r.avg_review_rating,
      reservations_completed: completed,
      reservations_cancelled: cancelled,
      reservation_close_rate: safeRate(completed, completed + cancelled),
      avg_work_minutes: r.avg_work_minutes,
      distinct_customers: distinct,
      returning_customers: returning,
      repeat_rate: safeRate(returning, distinct),
    };
  });

  // Sort by cert_count desc as primary "headline" metric.
  enriched.sort((a, b) => b.cert_count - a.cert_count || b.reservations_completed - a.reservations_completed);

  const totals = {
    staff_with_activity: enriched.length,
    total_cert_count: enriched.reduce((s, r) => s + r.cert_count, 0),
    total_reservations_completed: enriched.reduce((s, r) => s + r.reservations_completed, 0),
    total_reviews: enriched.reduce((s, r) => s + r.review_count, 0),
  };

  return {
    window: args.window,
    since: since?.toISOString() ?? null,
    staff: enriched,
    totals,
  };
}

/** Convert numeric avg authenticity grade (0-3) to display label. */
export function authenticityGradeLabel(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value >= 2.5) return "プレミアム";
  if (value >= 1.5) return "認証済み";
  if (value >= 0.5) return "基本";
  return "未認証";
}
