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

    // ── Fetch all counts in a single Promise.all (5 parallel groups → 5 round trips max) ──
    const [certResult, customerResult, invoiceResult, reservationResult, orderResult] = await Promise.allSettled([
      // Certificates: fetch all with status to compute counts in JS (1 query instead of 7)
      admin
        .from("certificates")
        .select("status, created_at, expiry_date")
        .eq("tenant_id", tenantId),
      // Customers: 2 counts in parallel
      Promise.all([
        admin.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        admin.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", thisMonthStart),
      ]),
      // Invoices: fetch unpaid docs (covers total, unpaid, unpaidAmount, overdueCount in 1 query + 1 count)
      Promise.all([
        admin.from("documents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("doc_type", "invoice"),
        admin.from("documents").select("total, status").eq("tenant_id", tenantId).eq("doc_type", "invoice").in("status", ["sent", "overdue"]),
      ]),
      // Reservations: 3 counts in parallel
      Promise.all([
        admin.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("scheduled_date", today).neq("status", "cancelled"),
        admin.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("scheduled_date", weekStartStr).lte("scheduled_date", weekEndStr).neq("status", "cancelled"),
        admin.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "confirmed"),
      ]),
      // Orders: 2 counts in parallel
      Promise.all([
        admin.from("job_orders").select("id", { count: "exact", head: true }).or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`).in("status", ["pending", "accepted", "in_progress", "approval_pending", "payment_pending"]),
        admin.from("job_orders").select("id", { count: "exact", head: true }).or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`).eq("status", "completed").gte("updated_at", thisMonthStart),
      ]),
    ]);

    // ── Section: Certificates (computed from single query) ──
    let certificates: Record<string, unknown> = { total: 0, active: 0, void: 0, draft: 0, thisMonth: 0 };
    let expiring = { next7days: 0, next30days: 0 };
    if (certResult.status === "fulfilled") {
      const certs = certResult.value.data ?? [];
      let total = 0, active = 0, voidCount = 0, draft = 0, thisMonth = 0, exp7 = 0, exp30 = 0;
      for (const c of certs) {
        total++;
        if (c.status === "active") active++;
        else if (c.status === "void") voidCount++;
        else if (c.status === "draft") draft++;
        if (c.created_at && c.created_at >= thisMonthStart) thisMonth++;
        if (c.status === "active" && c.expiry_date) {
          if (c.expiry_date >= today && c.expiry_date <= next7daysStr) exp7++;
          if (c.expiry_date >= today && c.expiry_date <= next30daysStr) exp30++;
        }
      }
      certificates = { total, active, void: voidCount, draft, thisMonth };
      expiring = { next7days: exp7, next30days: exp30 };
    }

    // ── Section: Customers ──
    let customers = { total: 0, thisMonth: 0 };
    if (customerResult.status === "fulfilled") {
      const [{ count: custTotal }, { count: custMonth }] = customerResult.value;
      customers = { total: custTotal ?? 0, thisMonth: custMonth ?? 0 };
    }

    // ── Section: Invoices ──
    let invoices = { total: 0, unpaid: 0, unpaidAmount: 0, overdueCount: 0 };
    if (invoiceResult.status === "fulfilled") {
      const [{ count: invTotal }, { data: unpaidDocs }] = invoiceResult.value;
      const docs = unpaidDocs ?? [];
      const unpaidAmount = docs.reduce((sum: number, d: any) => sum + (d.total ?? 0), 0);
      const overdueCount = docs.filter((d: any) => d.status === "overdue").length;
      invoices = { total: invTotal ?? 0, unpaid: docs.length, unpaidAmount, overdueCount };
    }

    // ── Section: Reservations ──
    let reservations = { today: 0, thisWeek: 0, pending: 0 };
    if (reservationResult.status === "fulfilled") {
      const [{ count: resToday }, { count: resWeek }, { count: resPending }] = reservationResult.value;
      reservations = { today: resToday ?? 0, thisWeek: resWeek ?? 0, pending: resPending ?? 0 };
    }

    // ── Section: Orders ──
    let orders = { active: 0, completedThisMonth: 0 };
    if (orderResult.status === "fulfilled") {
      const [{ count: activeOrders }, { count: completedMonth }] = orderResult.value;
      orders = { active: activeOrders ?? 0, completedThisMonth: completedMonth ?? 0 };
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
