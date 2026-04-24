import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { withCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

// ─── GET: ダッシュボード統合サマリー ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    const tenantId = caller.tenantId;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const result = await withCache(`dashboard-summary:${tenantId}`, 30, async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Calculate date ranges for expiry checks
      const next7days = new Date(now);
      next7days.setDate(next7days.getDate() + 7);
      const next7daysStr = next7days.toISOString().slice(0, 10);
      const next30days = new Date(now);
      next30days.setDate(next30days.getDate() + 30);
      const next30daysStr = next30days.toISOString().slice(0, 10);

      // Week range (Monday to Sunday)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + mondayOffset);
      const weekStartStr = weekStart.toISOString().slice(0, 10);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);

      // ── Fetch all counts in parallel (DB-side aggregation, head-only queries) ──
      const [
        certTotalResult,
        certActiveResult,
        certVoidResult,
        certDraftResult,
        certThisMonthResult,
        certExp7Result,
        certExp30Result,
        custTotalResult,
        custMonthResult,
        invTotalResult,
        invUnpaidResult,
        invOverdueResult,
        resTodayResult,
        resWeekResult,
        resPendingResult,
        ordersActiveResult,
        ordersCompletedResult,
      ] = await Promise.all([
        // Certificates: individual count queries
        admin.from("certificates").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
        admin
          .from("certificates")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
        admin
          .from("certificates")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "void"),
        admin
          .from("certificates")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "draft"),
        admin
          .from("certificates")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", thisMonthStart),
        admin
          .from("certificates")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .gte("expiry_date", today)
          .lte("expiry_date", next7daysStr),
        admin
          .from("certificates")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .gte("expiry_date", today)
          .lte("expiry_date", next30daysStr),
        // Customers: 2 counts
        admin.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
        admin
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", thisMonthStart),
        // Invoices: total, unpaid (sent+overdue), overdue only
        admin
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice"),
        admin
          .from("documents")
          .select("total")
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .in("status", ["sent", "overdue"]),
        admin
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .eq("status", "overdue"),
        // Reservations: 3 counts
        admin
          .from("reservations")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("scheduled_date", today)
          .neq("status", "cancelled"),
        admin
          .from("reservations")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("scheduled_date", weekStartStr)
          .lte("scheduled_date", weekEndStr)
          .neq("status", "cancelled"),
        admin
          .from("reservations")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "confirmed"),
        // Orders: 2 counts
        admin
          .from("job_orders")
          .select("*", { count: "exact", head: true })
          .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
          .in("status", ["pending", "accepted", "in_progress", "approval_pending", "payment_pending"]),
        admin
          .from("job_orders")
          .select("*", { count: "exact", head: true })
          .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
          .eq("status", "completed")
          .gte("updated_at", thisMonthStart),
      ]);

      // ── Section: Certificates ──
      const certificates = {
        total: certTotalResult.count ?? 0,
        active: certActiveResult.count ?? 0,
        void: certVoidResult.count ?? 0,
        draft: certDraftResult.count ?? 0,
        thisMonth: certThisMonthResult.count ?? 0,
      };
      const expiring = {
        next7days: certExp7Result.count ?? 0,
        next30days: certExp30Result.count ?? 0,
      };

      // ── Section: Customers ──
      const customers = {
        total: custTotalResult.count ?? 0,
        thisMonth: custMonthResult.count ?? 0,
      };

      // ── Section: Invoices ──
      const unpaidDocs = invUnpaidResult.data ?? [];
      const unpaidAmount = unpaidDocs.reduce((sum: number, d: any) => sum + (d.total ?? 0), 0);
      const invoices = {
        total: invTotalResult.count ?? 0,
        unpaid: unpaidDocs.length,
        unpaidAmount,
        overdueCount: invOverdueResult.count ?? 0,
      };

      // ── Section: Reservations ──
      const reservations = {
        today: resTodayResult.count ?? 0,
        thisWeek: resWeekResult.count ?? 0,
        pending: resPendingResult.count ?? 0,
      };

      // ── Section: Orders ──
      const orders = {
        active: ordersActiveResult.count ?? 0,
        completedThisMonth: ordersCompletedResult.count ?? 0,
      };

      // ── Section: Recent Certificates ──
      let recentCertificates: unknown[] = [];
      try {
        const { data: recentCerts } = await admin
          .from("certificates")
          .select("public_id, customer_name, status, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(5);
        recentCertificates = recentCerts ?? [];
      } catch (e) {
        console.error("[dashboard-summary] recentCertificates section failed:", e);
      }

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
}
