import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiInternalError } from "@/lib/api/response";
import { withCache } from "@/lib/cache";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── GET: ダッシュボード統合サマリー ───
export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const tenantId = caller.tenantId;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const result = await withCache(`dashboard-summary:${tenantId}`, 30, async () => {
        // Single-RPC aggregation (16 head-counts → 1 transaction).
        // The unpaid invoice totals + recent certificates run in parallel
        // alongside the main RPC since they need different return shapes.
        const [summaryRes, invUnpaidRes, recentCertsRes] = await Promise.all([
          admin.rpc("dashboard_summary_counts", { p_tenant_id: tenantId }),
          admin.rpc("dashboard_unpaid_invoice_totals", { p_tenant_id: tenantId }),
          admin
            .from("certificates")
            .select("public_id, customer_name, status, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        // RPC payload shape — matches the migration's json_build_object(...)
        const summary = (summaryRes.data ?? {}) as {
          certificates?: { total?: number; active?: number; void?: number; draft?: number; thisMonth?: number };
          expiring?: { next7days?: number; next30days?: number };
          customers?: { total?: number; thisMonth?: number };
          invoices_total?: number;
          reservations?: { today?: number; thisWeek?: number; pending?: number };
          orders?: { active?: number; completedThisMonth?: number };
        };

        const certificates = {
          total: summary.certificates?.total ?? 0,
          active: summary.certificates?.active ?? 0,
          void: summary.certificates?.void ?? 0,
          draft: summary.certificates?.draft ?? 0,
          thisMonth: summary.certificates?.thisMonth ?? 0,
        };
        const expiring = {
          next7days: summary.expiring?.next7days ?? 0,
          next30days: summary.expiring?.next30days ?? 0,
        };
        const customers = {
          total: summary.customers?.total ?? 0,
          thisMonth: summary.customers?.thisMonth ?? 0,
        };
        const reservations = {
          today: summary.reservations?.today ?? 0,
          thisWeek: summary.reservations?.thisWeek ?? 0,
          pending: summary.reservations?.pending ?? 0,
        };
        const orders = {
          active: summary.orders?.active ?? 0,
          completedThisMonth: summary.orders?.completedThisMonth ?? 0,
        };

        // Unpaid invoice totals — the dedicated RPC returns a single row
        // { unpaid_count, unpaid_amount, overdue_count }. Some Supabase RPC
        // return shapes wrap it in an array; tolerate both.
        const unpaidRow = Array.isArray(invUnpaidRes.data) ? (invUnpaidRes.data[0] ?? null) : invUnpaidRes.data;
        const invoices = {
          total: summary.invoices_total ?? 0,
          unpaid: Number(unpaidRow?.unpaid_count ?? 0),
          unpaidAmount: Number(unpaidRow?.unpaid_amount ?? 0),
          overdueCount: Number(unpaidRow?.overdue_count ?? 0),
        };

        const recentCertificates = recentCertsRes.data ?? [];

        // ── Section: Alerts ──
        const alerts: { type: string; count: number; message: string }[] = [];
        if (invoices.overdueCount > 0) {
          alerts.push({
            type: "overdue_invoice",
            count: invoices.overdueCount,
            message: `${invoices.overdueCount}件の未回収請求書があります`,
          });
        }
        if (expiring.next7days > 0) {
          alerts.push({
            type: "expiring_cert",
            count: expiring.next7days,
            message: `${expiring.next7days}件の証明書が7日以内に期限切れになります`,
          });
        }
        if (reservations.pending > 0) {
          alerts.push({
            type: "pending_reservation",
            count: reservations.pending,
            message: `${reservations.pending}件の確認済み予約があります`,
          });
        }

        return { certificates, expiring, customers, invoices, reservations, orders, recentCertificates, alerts };
      });

      return apiJson(result, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      });
    } catch (e: unknown) {
      return apiInternalError(e, "dashboard-summary GET");
    }
  },
  { minRole: "staff", routeName: "admin/dashboard-summary GET" },
);
