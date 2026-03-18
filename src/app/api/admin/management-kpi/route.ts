import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    // ── Fetch all data in parallel ──
    const [
      { data: allInvoices },
      { data: allDocuments },
      { data: allCustomers },
      { data: allCerts },
      { data: purchaseOrders },
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, total, subtotal, tax, status, issued_at, due_date, customer_id, created_at")
        .eq("tenant_id", caller.tenantId),
      supabase
        .from("documents")
        .select("id, total, subtotal, tax, status, doc_type, issued_at, due_date, customer_id, created_at, source_document_id")
        .eq("tenant_id", caller.tenantId),
      supabase
        .from("customers")
        .select("id, created_at")
        .eq("tenant_id", caller.tenantId),
      supabase
        .from("certificates")
        .select("id, status, service_price, customer_id, created_at")
        .eq("tenant_id", caller.tenantId),
      supabase
        .from("documents")
        .select("id, total, status, issued_at, created_at")
        .eq("tenant_id", caller.tenantId)
        .eq("doc_type", "purchase_order")
        .neq("status", "cancelled"),
    ]);

    const invoices = allInvoices ?? [];
    const documents = allDocuments ?? [];
    const customers = allCustomers ?? [];
    const certs = allCerts ?? [];
    const poList = purchaseOrders ?? [];

    // ══════════════════════════════════
    // 1. キャッシュフロー (Cash Flow)
    // ══════════════════════════════════

    // 入金額 (Cash In) = paid invoices + paid invoice-type documents
    const paidInvoices = invoices.filter(i => i.status === "paid");
    const cashInInvoices = paidInvoices.reduce((s, i) => s + (i.total ?? 0), 0);
    const paidDocInvoices = documents.filter(d =>
      d.status === "paid" && ["invoice", "consolidated_invoice", "receipt"].includes(d.doc_type)
    );
    const cashInDocs = paidDocInvoices.reduce((s, d) => s + (d.total ?? 0), 0);
    const totalCashIn = cashInInvoices + cashInDocs;

    // 売掛金 (Accounts Receivable) = sent/overdue invoices
    const arInvoices = invoices.filter(i => i.status === "sent" || i.status === "overdue");
    const accountsReceivable = arInvoices.reduce((s, i) => s + (i.total ?? 0), 0);
    const arDocuments = documents.filter(d =>
      (d.status === "sent" || d.status === "accepted") &&
      ["invoice", "consolidated_invoice"].includes(d.doc_type)
    );
    const arDocsTotal = arDocuments.reduce((s, d) => s + (d.total ?? 0), 0);
    const totalAR = accountsReceivable + arDocsTotal;

    // 支出 (Cash Out) = purchase orders (sent/accepted/paid)
    const totalCashOut = poList
      .filter(p => p.status !== "draft")
      .reduce((s, p) => s + (p.total ?? 0), 0);

    // 営業CF = 入金 - 支出
    const operatingCF = totalCashIn - totalCashOut;

    // 今月のCF
    const thisMonthCashIn = [...paidInvoices, ...paidDocInvoices]
      .filter(i => {
        const d = i.issued_at || i.created_at;
        return d && d >= thisMonthStart && d <= thisMonthEnd;
      })
      .reduce((s, i) => s + (i.total ?? 0), 0);

    const thisMonthCashOut = poList
      .filter(p => {
        const d = p.issued_at || p.created_at;
        return d && d >= thisMonthStart && d <= thisMonthEnd && p.status !== "draft";
      })
      .reduce((s, p) => s + (p.total ?? 0), 0);

    const thisMonthCF = thisMonthCashIn - thisMonthCashOut;

    // 先月のCF
    const lastMonthCashIn = [...paidInvoices, ...paidDocInvoices]
      .filter(i => {
        const d = i.issued_at || i.created_at;
        return d && d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((s, i) => s + (i.total ?? 0), 0);

    const lastMonthCashOut = poList
      .filter(p => {
        const d = p.issued_at || p.created_at;
        return d && d >= lastMonthStart && d <= lastMonthEnd && p.status !== "draft";
      })
      .reduce((s, p) => s + (p.total ?? 0), 0);

    const lastMonthCF = lastMonthCashIn - lastMonthCashOut;

    // CF成長率
    const cfGrowthRate = lastMonthCF !== 0
      ? ((thisMonthCF - lastMonthCF) / Math.abs(lastMonthCF)) * 100
      : null;

    // ══════════════════════════════════
    // 2. 回収率 (Collection Rate)
    // ══════════════════════════════════
    const totalInvoiced = invoices
      .filter(i => i.status !== "cancelled" && i.status !== "draft")
      .reduce((s, i) => s + (i.total ?? 0), 0);
    const totalPaid = paidInvoices.reduce((s, i) => s + (i.total ?? 0), 0);
    const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : null;

    // 期限超過の件数・金額
    const overdueInvoices = invoices.filter(i => i.status === "overdue");
    const overdueCount = overdueInvoices.length;
    const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.total ?? 0), 0);

    // ══════════════════════════════════
    // 3. DSO (Days Sales Outstanding / 売掛回転日数)
    // ══════════════════════════════════
    // 簡易計算: (売掛金 / 直近3ヶ月の売上平均) × 30
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    const recentRevenue = invoices
      .filter(i => {
        const d = i.issued_at || i.created_at;
        return d && d >= threeMonthsAgo && i.status !== "cancelled";
      })
      .reduce((s, i) => s + (i.total ?? 0), 0);
    const monthlyAvgRevenue = recentRevenue / 3;
    const dso = monthlyAvgRevenue > 0 ? Math.round((totalAR / monthlyAvgRevenue) * 30) : null;

    // ══════════════════════════════════
    // 4. 顧客単価 (ARPU)
    // ══════════════════════════════════
    const activeCustomerIds = new Set<string>();
    for (const inv of invoices) {
      if (inv.customer_id && inv.status !== "cancelled") activeCustomerIds.add(inv.customer_id);
    }
    for (const doc of documents) {
      if (doc.customer_id && doc.status !== "cancelled" &&
        ["invoice", "consolidated_invoice", "receipt"].includes(doc.doc_type)) {
        activeCustomerIds.add(doc.customer_id);
      }
    }
    const totalRevenue = invoices
      .filter(i => i.status !== "cancelled")
      .reduce((s, i) => s + (i.total ?? 0), 0)
      + documents
        .filter(d => d.status !== "cancelled" && ["invoice", "consolidated_invoice", "receipt"].includes(d.doc_type))
        .reduce((s, d) => s + (d.total ?? 0), 0);

    const arpu = activeCustomerIds.size > 0
      ? Math.round(totalRevenue / activeCustomerIds.size)
      : null;

    // ══════════════════════════════════
    // 5. 粗利率 (Gross Margin)
    // ══════════════════════════════════
    // 粗利 = 売上 - 仕入（発注書）
    const totalPurchases = poList.reduce((s, p) => s + (p.total ?? 0), 0);
    const grossProfit = totalRevenue - totalPurchases;
    const grossMarginRate = totalRevenue > 0
      ? (grossProfit / totalRevenue) * 100
      : null;

    // ══════════════════════════════════
    // 6. 見積→受注 転換率 (Conversion Rate)
    // ══════════════════════════════════
    const estimates = documents.filter(d => d.doc_type === "estimate" && d.status !== "cancelled");
    const acceptedEstimates = estimates.filter(d => d.status === "accepted" || d.status === "paid");
    // Also check if any estimate has a linked invoice via source_document_id
    const estimateIds = new Set(estimates.map(e => e.id));
    const linkedFromEstimate = documents.filter(d =>
      d.source_document_id && estimateIds.has(d.source_document_id) &&
      ["invoice", "consolidated_invoice"].includes(d.doc_type)
    );
    const convertedEstimateCount = new Set([
      ...acceptedEstimates.map(e => e.id),
      ...linkedFromEstimate.map(d => d.source_document_id),
    ]).size;
    const conversionRate = estimates.length > 0
      ? (convertedEstimateCount / estimates.length) * 100
      : null;

    // ══════════════════════════════════
    // 7. 顧客数推移 (Customer Growth)
    // ══════════════════════════════════
    const customersByMonth: { month: string; label: string; count: number; cumulative: number }[] = [];
    const custMonthMap = new Map<string, number>();
    for (const c of customers) {
      if (!c.created_at) continue;
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      custMonthMap.set(key, (custMonthMap.get(key) ?? 0) + 1);
    }

    let cumulative = 0;
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      const count = custMonthMap.get(key) ?? 0;
      // Count customers created before this month for accurate cumulative
      cumulative += count;
      customersByMonth.push({ month: key, label, count, cumulative });
    }
    // Adjust cumulative: add customers created before the 12-month window
    const beforeWindowCount = customers.filter(c => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key < customersByMonth[0]?.month;
    }).length;
    for (const cm of customersByMonth) {
      cm.cumulative += beforeWindowCount;
    }

    // ══════════════════════════════════
    // 8. 証明書発行推移
    // ══════════════════════════════════
    const certsByMonth: { month: string; label: string; count: number }[] = [];
    const certMonthMap = new Map<string, number>();
    for (const c of certs) {
      if (!c.created_at) continue;
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      certMonthMap.set(key, (certMonthMap.get(key) ?? 0) + 1);
    }
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      certsByMonth.push({ month: key, label, count: certMonthMap.get(key) ?? 0 });
    }

    // ══════════════════════════════════
    // 9. CF予測 (入金予定)
    // ══════════════════════════════════
    // 支払期限が今月・来月のAR
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
    const upcomingAR = arInvoices
      .filter(i => i.due_date && i.due_date <= nextMonthEnd)
      .reduce((s, i) => s + (i.total ?? 0), 0);

    // ══════════════════════════════════
    // 10. LTV (顧客生涯価値) 簡易計算
    // ══════════════════════════════════
    // LTV = ARPU × 平均取引月数
    // 各顧客の取引期間を計算
    const customerFirstLast = new Map<string, { first: string; last: string }>();
    for (const inv of invoices) {
      if (!inv.customer_id || inv.status === "cancelled") continue;
      const d = inv.issued_at || inv.created_at;
      if (!d) continue;
      const existing = customerFirstLast.get(inv.customer_id);
      if (!existing) {
        customerFirstLast.set(inv.customer_id, { first: d, last: d });
      } else {
        if (d < existing.first) existing.first = d;
        if (d > existing.last) existing.last = d;
      }
    }
    let totalMonthSpan = 0;
    let custWithData = 0;
    for (const [, fl] of customerFirstLast) {
      const firstD = new Date(fl.first);
      const lastD = new Date(fl.last);
      const months = (lastD.getFullYear() - firstD.getFullYear()) * 12 + (lastD.getMonth() - firstD.getMonth()) + 1;
      totalMonthSpan += months;
      custWithData++;
    }
    const avgCustomerLifeMonths = custWithData > 0 ? totalMonthSpan / custWithData : 0;
    const monthlyArpu = arpu && avgCustomerLifeMonths > 0 ? Math.round(arpu / avgCustomerLifeMonths) : null;
    const ltv = monthlyArpu && avgCustomerLifeMonths > 0
      ? Math.round(monthlyArpu * avgCustomerLifeMonths)
      : arpu; // fallback to ARPU if can't calculate

    return NextResponse.json({
      cashFlow: {
        totalCashIn,
        totalCashOut,
        operatingCF,
        thisMonth: { cashIn: thisMonthCashIn, cashOut: thisMonthCashOut, cf: thisMonthCF },
        lastMonth: { cashIn: lastMonthCashIn, cashOut: lastMonthCashOut, cf: lastMonthCF },
        cfGrowthRate,
        accountsReceivable: totalAR,
        upcomingAR,
      },
      collection: {
        totalInvoiced,
        totalPaid,
        collectionRate,
        overdueCount,
        overdueAmount,
        dso,
      },
      customers: {
        total: customers.length,
        activeCustomers: activeCustomerIds.size,
        arpu,
        ltv,
        avgLifeMonths: Math.round(avgCustomerLifeMonths * 10) / 10,
        growthByMonth: customersByMonth,
      },
      profitability: {
        totalRevenue,
        totalPurchases,
        grossProfit,
        grossMarginRate,
      },
      conversion: {
        totalEstimates: estimates.length,
        convertedEstimates: convertedEstimateCount,
        conversionRate,
      },
      certificates: {
        total: certs.length,
        active: certs.filter(c => c.status === "active").length,
        byMonth: certsByMonth,
        avgServicePrice: certs.filter(c => c.service_price != null && c.service_price > 0).length > 0
          ? Math.round(
              certs.filter(c => c.service_price != null && c.service_price > 0)
                .reduce((s, c) => s + c.service_price, 0)
              / certs.filter(c => c.service_price != null && c.service_price > 0).length
            )
          : null,
      },
    });
  } catch (e: unknown) {
    console.error("[management-kpi] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
