/**
 * 技術者別パフォーマンス分析 — サーバ側集約。
 *
 * 請求書 (documents.doc_type='invoice') を assigned_user_id でグループ化し、
 * 件数 / 売上合計 / 平均単価 / 完了 (引渡済み) 件数を集計する。
 * 担当者名は auth.users (user_metadata.display_name / email) で補完し、
 * assigned_user_id が NULL の請求書は「未割当」バケットに集約する。
 *
 * テナント境界: createTenantScopedAdmin + 明示的 tenant_id 絞り込み。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";

export interface TechnicianStatsRow {
  user_id: string | null; // null = 未割当
  name: string;
  invoice_count: number;
  total_revenue: number;
  avg_revenue_per_invoice: number;
  completed_count: number; // job_status='delivered' の件数
  completion_rate: number; // completed_count / invoice_count (0..1)
}

export interface TechnicianPerformanceResult {
  from: string;
  to: string;
  technicians: TechnicianStatsRow[];
  totals: {
    invoice_count: number;
    total_revenue: number;
    completed_count: number;
  };
}

const UNASSIGNED_KEY = "__unassigned__";

type DocRow = {
  assigned_user_id: string | null;
  total: number | null;
  job_status: string | null;
};

/** "YYYY-MM-DD" バリデーション。不正なら null。 */
export function normalizeDate(v: string | null | undefined): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * 担当者別パフォーマンスを集計する。
 *
 * @param from 期間開始 (YYYY-MM-DD, issued_at 基準, inclusive)
 * @param to   期間終了 (YYYY-MM-DD, issued_at 基準, inclusive)
 */
export async function getTechnicianPerformance(args: {
  tenantId: string;
  from: string;
  to: string;
}): Promise<TechnicianPerformanceResult> {
  const { admin } = createTenantScopedAdmin(args.tenantId);

  const { data: rawDocs, error } = await admin
    .from("documents")
    .select("assigned_user_id, total, job_status")
    .eq("tenant_id", args.tenantId)
    .eq("doc_type", "invoice")
    .gte("issued_at", args.from)
    .lte("issued_at", args.to)
    .limit(50000)
    .returns<DocRow[]>();
  if (error) throw new Error(`getTechnicianPerformance documents: ${error.message}`);

  const docs = rawDocs ?? [];

  // user_id (または UNASSIGNED) ごとに集計。
  type Agg = { invoice_count: number; total_revenue: number; completed_count: number };
  const aggMap = new Map<string, Agg>();
  for (const d of docs) {
    const key = d.assigned_user_id ?? UNASSIGNED_KEY;
    const agg = aggMap.get(key) ?? { invoice_count: 0, total_revenue: 0, completed_count: 0 };
    agg.invoice_count += 1;
    agg.total_revenue += d.total ?? 0;
    if (d.job_status === "delivered") agg.completed_count += 1;
    aggMap.set(key, agg);
  }

  // 担当者名解決 (auth.users + membership)。
  const assignedUserIds = [...aggMap.keys()].filter((k) => k !== UNASSIGNED_KEY);
  const nameMap = new Map<string, string>();
  if (assignedUserIds.length > 0) {
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const users = (usersData?.users ?? []) as Array<{
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    }>;
    for (const u of users) {
      const meta = u.user_metadata as Record<string, unknown> | undefined;
      const display = (meta?.display_name as string | undefined)?.trim();
      nameMap.set(u.id, display || u.email || u.id.slice(0, 8));
    }
  }

  const technicians: TechnicianStatsRow[] = [];
  for (const [key, agg] of aggMap) {
    const isUnassigned = key === UNASSIGNED_KEY;
    technicians.push({
      user_id: isUnassigned ? null : key,
      name: isUnassigned ? "未割当" : (nameMap.get(key) ?? key.slice(0, 8)),
      invoice_count: agg.invoice_count,
      total_revenue: agg.total_revenue,
      avg_revenue_per_invoice: agg.invoice_count > 0 ? Math.round(agg.total_revenue / agg.invoice_count) : 0,
      completed_count: agg.completed_count,
      completion_rate: agg.invoice_count > 0 ? agg.completed_count / agg.invoice_count : 0,
    });
  }

  // 売上合計の降順。未割当は末尾に寄せる。
  technicians.sort((a, b) => {
    if (a.user_id === null) return 1;
    if (b.user_id === null) return -1;
    return b.total_revenue - a.total_revenue;
  });

  const totals = technicians.reduce(
    (acc, t) => {
      acc.invoice_count += t.invoice_count;
      acc.total_revenue += t.total_revenue;
      acc.completed_count += t.completed_count;
      return acc;
    },
    { invoice_count: 0, total_revenue: 0, completed_count: 0 },
  );

  return { from: args.from, to: args.to, technicians, totals };
}
