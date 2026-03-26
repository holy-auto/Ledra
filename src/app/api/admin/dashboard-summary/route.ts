import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

// ─── GET: ダッシュボード統合サマリー ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const tenantId = caller.tenantId;
    const admin = getAdminClient();
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

    // ── Section: Certificates ──
    let certificates: Record<string, unknown> = { total: 0, active: 0, void: 0, draft: 0, thisMonth: 0 };
    try {
      const [
        { count: total },
        { count: active },
        { count: voidCount },
        { count: draft },
        { count: thisMonth },
      ] = await Promise.all([
        admin.from("certificates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        admin.from("certificates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "active"),
        admin.from("certificates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "void"),
        admin.from("certificates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "draft"),
        admin.from("certificates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", thisMonthStart),
      ]);
      certificates = { total: total ?? 0, active: active ?? 0, void: voidCount ?? 0, draft: draft ?? 0, thisMonth: thisMonth ?? 0 };
    } catch (e) {
      console.error("[dashboard-summary] certificates section failed:", e);
    }

    // ── Section: Expiring certificates ──
    let expiring = { next7days: 0, next30days: 0 };
    try {
      const [{ count: exp7 }, { count: exp30 }] = await Promise.all([
        admin
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .lte("expiry_date", next7daysStr)
          .gte("expiry_date", today),
        admin
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .lte("expiry_date", next30daysStr)
          .gte("expiry_date", today),
      ]);
      expiring = { next7days: exp7 ?? 0, next30days: exp30 ?? 0 };
    } catch (e) {
      console.error("[dashboard-summary] expiring section failed:", e);
    }

    // ── Section: Customers ──
    let customers = { total: 0, thisMonth: 0 };
    try {
      const [{ count: custTotal }, { count: custMonth }] = await Promise.all([
        admin.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        admin.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", thisMonthStart),
      ]);
      customers = { total: custTotal ?? 0, thisMonth: custMonth ?? 0 };
    } catch (e) {
      console.error("[dashboard-summary] customers section failed:", e);
    }

    // ── Section: Invoices ──
    let invoices = { total: 0, unpaid: 0, unpaidAmount: 0, overdueCount: 0 };
    try {
      const [{ count: invTotal }, { data: unpaidDocs }, { count: overdueCount }] = await Promise.all([
        admin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice"),
        admin
          .from("documents")
          .select("total, status")
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .in("status", ["sent", "overdue"]),
        admin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("doc_type", "invoice")
          .eq("status", "overdue"),
      ]);
      const unpaidAmount = (unpaidDocs ?? []).reduce((sum: number, d: any) => sum + (d.total ?? 0), 0);
      invoices = {
        total: invTotal ?? 0,
        unpaid: (unpaidDocs ?? []).length,
        unpaidAmount,
        overdueCount: overdueCount ?? 0,
      };
    } catch (e) {
      console.error("[dashboard-summary] invoices section failed:", e);
    }

    // ── Section: Reservations ──
    let reservations = { today: 0, thisWeek: 0, pending: 0 };
    try {
      const [{ count: resToday }, { count: resWeek }, { count: resPending }] = await Promise.all([
        admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("scheduled_date", today)
          .neq("status", "cancelled"),
        admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("scheduled_date", weekStartStr)
          .lte("scheduled_date", weekEndStr)
          .neq("status", "cancelled"),
        admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "confirmed"),
      ]);
      reservations = { today: resToday ?? 0, thisWeek: resWeek ?? 0, pending: resPending ?? 0 };
    } catch (e) {
      console.error("[dashboard-summary] reservations section failed:", e);
    }

    // ── Section: Orders ──
    let orders = { active: 0, completedThisMonth: 0 };
    try {
      const [{ count: activeOrders }, { count: completedMonth }] = await Promise.all([
        admin
          .from("job_orders")
          .select("id", { count: "exact", head: true })
          .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
          .in("status", ["pending", "accepted", "in_progress", "approval_pending", "payment_pending"]),
        admin
          .from("job_orders")
          .select("id", { count: "exact", head: true })
          .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
          .eq("status", "completed")
          .gte("updated_at", thisMonthStart),
      ]);
      orders = { active: activeOrders ?? 0, completedThisMonth: completedMonth ?? 0 };
    } catch (e) {
      console.error("[dashboard-summary] orders section failed:", e);
    }

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
    try {
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
    } catch (e) {
      console.error("[dashboard-summary] alerts section failed:", e);
    }

    return NextResponse.json({
      certificates,
      expiring,
      customers,
      invoices,
      reservations,
      orders,
      recentCertificates,
      alerts,
    });
  } catch (e: unknown) {
    console.error("[dashboard-summary] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
