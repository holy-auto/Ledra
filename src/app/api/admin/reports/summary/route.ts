/**
 * GET /api/admin/reports/summary?range=30d
 *
 * Tenant 内の経営サマリ KPI を返す。range は '7d' | '30d' | '90d' | 'ytd'。
 * 各 KPI は best-effort: ベーステーブルが存在しない場合は 0 を返して全体は失敗させない。
 *
 *   - revenue_total           : payments.amount (status='completed')
 *   - certificates_issued     : certificates.created_at
 *   - reservations_completed  : reservations.status='completed'
 *   - new_customers           : customers.created_at
 *   - active_customers        : customer_sessions の distinct customer_id
 *
 * 拡張時は keys を追加するだけで OK。フロントは存在 key だけ拾う。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const RANGE: Record<string, () => Date> = {
  "7d": () => new Date(Date.now() - 7 * 86_400_000),
  "30d": () => new Date(Date.now() - 30 * 86_400_000),
  "90d": () => new Date(Date.now() - 90 * 86_400_000),
  ytd: () => new Date(new Date().getFullYear(), 0, 1),
};

async function safeCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  table: string,
  dateCol: string,
  since: Date,
  extra?: { col: string; val: string },
): Promise<number> {
  let q = admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte(dateCol, since.toISOString());
  if (extra) q = q.eq(extra.col, extra.val);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

async function safeSumAmount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  since: Date,
): Promise<number> {
  const { data, error } = await admin
    .from("payments")
    .select("amount")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("paid_at", since.toISOString());
  if (error || !data) return 0;
  return (data as Array<{ amount: number | null }>).reduce((s, r) => s + (r.amount ?? 0), 0);
}

export const GET = withCaller(
  async (req, { caller }) => {
    try {

      const url = new URL(req.url);
      const rangeKey = url.searchParams.get("range") ?? "30d";
      const since = RANGE[rangeKey]?.();
      if (!since) return apiValidationError("invalid_range");

      const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

      const [revenueTotal, certsIssued, reservationsCompleted, newCustomers] = await Promise.all([
        safeSumAmount(admin, tenantId, since),
        safeCount(admin, tenantId, "certificates", "created_at", since),
        safeCount(admin, tenantId, "reservations", "scheduled_date", since, { col: "status", val: "completed" }),
        safeCount(admin, tenantId, "customers", "created_at", since),
      ]);

      return apiOk({
        range: rangeKey,
        since: since.toISOString(),
        kpis: {
          revenue_total: revenueTotal,
          certificates_issued: certsIssued,
          reservations_completed: reservationsCompleted,
          new_customers: newCustomers,
        },
      });
    } catch (e) {
      return apiInternalError(e, "admin/reports/summary");
    }
  },
  { minRole: "admin", routeName: "admin/reports/summary" },
);
