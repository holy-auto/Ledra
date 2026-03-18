import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

type MonthData = {
  month: string; // "YYYY-MM"
  label: string; // "2026年3月"
  invoiceTotal: number;
  documentTotal: number;
  combinedTotal: number;
  count: number;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Fetch all invoices (non-cancelled) for this tenant
    const { data: invoices } = await supabase
      .from("invoices")
      .select("total, issued_at, status, created_at")
      .eq("tenant_id", caller.tenantId)
      .neq("status", "cancelled");

    // Fetch all documents (invoice/receipt type, non-cancelled) for revenue
    const { data: documents } = await supabase
      .from("documents")
      .select("total, issued_at, status, doc_type, created_at")
      .eq("tenant_id", caller.tenantId)
      .in("doc_type", ["invoice", "consolidated_invoice", "receipt"])
      .neq("status", "cancelled");

    // Also fetch estimates for pipeline tracking
    const { data: estimates } = await supabase
      .from("documents")
      .select("total, issued_at, status, created_at")
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "estimate")
      .neq("status", "cancelled");

    // Build monthly buckets for last 12 months
    const now = new Date();
    const months: MonthData[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      months.push({
        month: key,
        label,
        invoiceTotal: 0,
        documentTotal: 0,
        combinedTotal: 0,
        count: 0,
      });
    }

    const monthMap = new Map(months.map((m) => [m.month, m]));

    // Aggregate invoices by month
    for (const inv of invoices ?? []) {
      const dateStr = inv.issued_at || inv.created_at;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthMap.get(key);
      if (bucket) {
        bucket.invoiceTotal += inv.total ?? 0;
        bucket.combinedTotal += inv.total ?? 0;
        bucket.count += 1;
      }
    }

    // Aggregate documents by month (invoice/receipt types only)
    for (const doc of documents ?? []) {
      const dateStr = doc.issued_at || doc.created_at;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthMap.get(key);
      if (bucket) {
        bucket.documentTotal += doc.total ?? 0;
        bucket.combinedTotal += doc.total ?? 0;
        bucket.count += 1;
      }
    }

    // Yearly aggregation
    const yearMap = new Map<string, { year: string; total: number; count: number }>();
    for (const m of months) {
      const year = m.month.slice(0, 4);
      if (!yearMap.has(year)) {
        yearMap.set(year, { year, total: 0, count: 0 });
      }
      const y = yearMap.get(year)!;
      y.total += m.combinedTotal;
      y.count += m.count;
    }

    // Current month & previous month for growth
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const currentMonth = monthMap.get(currentMonthKey);
    const prevMonth = monthMap.get(prevMonthKey);

    // Year-over-year: same month last year
    const lastYearDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearKey = `${lastYearDate.getFullYear()}-${String(lastYearDate.getMonth() + 1).padStart(2, "0")}`;

    // We need to fetch last year's same month if not in our 12-month window
    let lastYearSameMonth = monthMap.get(lastYearKey);
    if (!lastYearSameMonth) {
      // Fetch from DB directly
      const startOfMonth = new Date(lastYearDate.getFullYear(), lastYearDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(lastYearDate.getFullYear(), lastYearDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: lyInv } = await supabase
        .from("invoices")
        .select("total")
        .eq("tenant_id", caller.tenantId)
        .neq("status", "cancelled")
        .gte("issued_at", startOfMonth)
        .lte("issued_at", endOfMonth);

      const { data: lyDoc } = await supabase
        .from("documents")
        .select("total")
        .eq("tenant_id", caller.tenantId)
        .in("doc_type", ["invoice", "consolidated_invoice", "receipt"])
        .neq("status", "cancelled")
        .gte("issued_at", startOfMonth)
        .lte("issued_at", endOfMonth);

      const lyTotal = (lyInv ?? []).reduce((s, r) => s + (r.total ?? 0), 0)
        + (lyDoc ?? []).reduce((s, r) => s + (r.total ?? 0), 0);

      lastYearSameMonth = {
        month: lastYearKey,
        label: `${lastYearDate.getFullYear()}年${lastYearDate.getMonth() + 1}月`,
        invoiceTotal: 0,
        documentTotal: 0,
        combinedTotal: lyTotal,
        count: 0,
      };
    }

    // Calculate growth rates
    const monthGrowthRate = prevMonth && prevMonth.combinedTotal > 0
      ? ((currentMonth?.combinedTotal ?? 0) - prevMonth.combinedTotal) / prevMonth.combinedTotal * 100
      : null;

    const yearGrowthRate = lastYearSameMonth && lastYearSameMonth.combinedTotal > 0
      ? ((currentMonth?.combinedTotal ?? 0) - lastYearSameMonth.combinedTotal) / lastYearSameMonth.combinedTotal * 100
      : null;

    // Estimate pipeline (未確定の見積もり)
    const estimatePipeline = (estimates ?? [])
      .filter((e) => e.status === "draft" || e.status === "sent")
      .reduce((s, e) => s + (e.total ?? 0), 0);

    // Total revenue (all time from data we have)
    const totalRevenue = months.reduce((s, m) => s + m.combinedTotal, 0);

    // Find max month for chart scaling
    const maxMonthTotal = Math.max(...months.map((m) => m.combinedTotal), 1);

    return NextResponse.json({
      months,
      years: Array.from(yearMap.values()),
      current: {
        month: currentMonth?.combinedTotal ?? 0,
        monthLabel: currentMonth?.label ?? "",
        prevMonth: prevMonth?.combinedTotal ?? 0,
        prevMonthLabel: prevMonth?.label ?? "",
        lastYearSameMonth: lastYearSameMonth?.combinedTotal ?? 0,
        lastYearLabel: lastYearSameMonth?.label ?? "",
        monthGrowthRate,
        yearGrowthRate,
      },
      summary: {
        totalRevenue,
        estimatePipeline,
        maxMonthTotal,
        totalCount: months.reduce((s, m) => s + m.count, 0),
      },
    });
  } catch (e: unknown) {
    console.error("[billing-analytics] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
