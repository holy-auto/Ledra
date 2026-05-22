/**
 * Pricing elasticity analytics — server-side aggregation.
 *
 * Wraps the `pricing_elasticity_stats` PG RPC and post-processes
 * the per-(title, month) rows into convenient time-series and
 * cross-offering shapes for the UI.
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type PricingWindow = "90d" | "180d" | "365d" | "730d";

export const PRICING_WINDOW_LABEL: Record<PricingWindow, string> = {
  "90d": "過去3ヶ月",
  "180d": "過去6ヶ月",
  "365d": "過去1年",
  "730d": "過去2年",
};

export function pricingWindowToSince(window: PricingWindow): Date {
  const days = window === "90d" ? 90 : window === "180d" ? 180 : window === "365d" ? 365 : 730;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type RpcRow = {
  period_month: string; // ISO date
  title: string;
  reservation_count: number | string;
  completed_count: number | string;
  cancelled_count: number | string;
  avg_estimated_amount: number | null;
  min_estimated_amount: number | null;
  max_estimated_amount: number | null;
  total_completed_revenue: number | string;
};

export type PricingMonthlyPoint = {
  period_month: string; // ISO date (YYYY-MM-DD, day=1)
  reservation_count: number;
  completed_count: number;
  cancelled_count: number;
  close_rate: number | null;
  avg_estimated_amount: number | null;
  min_estimated_amount: number | null;
  max_estimated_amount: number | null;
  total_completed_revenue: number;
};

export type PricingOfferingSummary = {
  title: string;
  total_reservation_count: number;
  total_completed_count: number;
  total_cancelled_count: number;
  overall_close_rate: number | null;
  avg_price_overall: number | null;
  min_price_overall: number | null;
  max_price_overall: number | null;
  total_revenue: number;
  monthly: PricingMonthlyPoint[];
};

export type PricingElasticityResult = {
  window: PricingWindow;
  since: string;
  months: string[]; // sorted ascending (oldest → newest)
  offerings: PricingOfferingSummary[];
  totals: {
    offering_count: number;
    total_reservations: number;
    total_completed: number;
    total_revenue: number;
  };
};

function toNum(v: number | string): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

function safeRate(num: number, denom: number): number | null {
  if (denom <= 0) return null;
  return num / denom;
}

/**
 * Compute pricing-elasticity stats for the tenant + window.
 *
 * Returns offerings sorted by total revenue descending so the
 * UI can clip "long-tail" rows below a threshold if it wants.
 *
 * Caller MUST have verified tenant membership upstream.
 */
export async function getPricingElasticity(args: {
  tenantId: string;
  window: PricingWindow;
}): Promise<PricingElasticityResult> {
  const since = pricingWindowToSince(args.window);
  const { admin } = createTenantScopedAdmin(args.tenantId);

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("pricing_elasticity_stats", {
    p_tenant_id: args.tenantId,
    p_since: since.toISOString(),
  });

  if (rpcErr) {
    logger.error("pricing_elasticity_stats RPC failed", { error: rpcErr.message });
    throw new Error(`pricing_elasticity_stats: ${rpcErr.message}`);
  }

  const rpcRows = (rpcRaw as RpcRow[] | null) ?? [];

  // Materialize the month axis. We pad missing months so the UI
  // can render a stable x-axis without gaps.
  const monthSet = new Set<string>();
  const cursor = new Date(since);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  const now = new Date();
  while (cursor <= now) {
    monthSet.add(cursor.toISOString().slice(0, 10)); // YYYY-MM-01
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const months = [...monthSet].sort();

  // Group by offering title.
  type OfferingAcc = {
    title: string;
    byMonth: Map<string, PricingMonthlyPoint>;
  };
  const offerings = new Map<string, OfferingAcc>();

  for (const r of rpcRows) {
    if (!offerings.has(r.title)) {
      offerings.set(r.title, { title: r.title, byMonth: new Map() });
    }
    const o = offerings.get(r.title)!;
    const completed = toNum(r.completed_count);
    const cancelled = toNum(r.cancelled_count);
    const monthKey = r.period_month.slice(0, 10);
    o.byMonth.set(monthKey, {
      period_month: monthKey,
      reservation_count: toNum(r.reservation_count),
      completed_count: completed,
      cancelled_count: cancelled,
      close_rate: safeRate(completed, completed + cancelled),
      avg_estimated_amount: r.avg_estimated_amount,
      min_estimated_amount: r.min_estimated_amount,
      max_estimated_amount: r.max_estimated_amount,
      total_completed_revenue: toNum(r.total_completed_revenue),
    });
  }

  // Build the final offering summaries with month padding.
  const offeringSummaries: PricingOfferingSummary[] = [];
  for (const o of offerings.values()) {
    const monthly: PricingMonthlyPoint[] = months.map(
      (m) =>
        o.byMonth.get(m) ?? {
          period_month: m,
          reservation_count: 0,
          completed_count: 0,
          cancelled_count: 0,
          close_rate: null,
          avg_estimated_amount: null,
          min_estimated_amount: null,
          max_estimated_amount: null,
          total_completed_revenue: 0,
        },
    );

    const totalRes = monthly.reduce((s, p) => s + p.reservation_count, 0);
    const totalCompleted = monthly.reduce((s, p) => s + p.completed_count, 0);
    const totalCancelled = monthly.reduce((s, p) => s + p.cancelled_count, 0);
    const totalRevenue = monthly.reduce((s, p) => s + p.total_completed_revenue, 0);

    // Weighted avg price = revenue-weighted across months
    let weightedSum = 0;
    let weightedCount = 0;
    let overallMin: number | null = null;
    let overallMax: number | null = null;
    for (const p of monthly) {
      if (p.avg_estimated_amount !== null && p.reservation_count > 0) {
        weightedSum += p.avg_estimated_amount * p.reservation_count;
        weightedCount += p.reservation_count;
      }
      if (p.min_estimated_amount !== null) {
        overallMin = overallMin === null ? p.min_estimated_amount : Math.min(overallMin, p.min_estimated_amount);
      }
      if (p.max_estimated_amount !== null) {
        overallMax = overallMax === null ? p.max_estimated_amount : Math.max(overallMax, p.max_estimated_amount);
      }
    }
    const avgPrice = weightedCount > 0 ? weightedSum / weightedCount : null;

    offeringSummaries.push({
      title: o.title,
      total_reservation_count: totalRes,
      total_completed_count: totalCompleted,
      total_cancelled_count: totalCancelled,
      overall_close_rate: safeRate(totalCompleted, totalCompleted + totalCancelled),
      avg_price_overall: avgPrice,
      min_price_overall: overallMin,
      max_price_overall: overallMax,
      total_revenue: totalRevenue,
      monthly,
    });
  }

  // Rank by revenue desc.
  offeringSummaries.sort(
    (a, b) => b.total_revenue - a.total_revenue || b.total_reservation_count - a.total_reservation_count,
  );

  const totals = {
    offering_count: offeringSummaries.length,
    total_reservations: offeringSummaries.reduce((s, o) => s + o.total_reservation_count, 0),
    total_completed: offeringSummaries.reduce((s, o) => s + o.total_completed_count, 0),
    total_revenue: offeringSummaries.reduce((s, o) => s + o.total_revenue, 0),
  };

  return {
    window: args.window,
    since: since.toISOString(),
    months,
    offerings: offeringSummaries,
    totals,
  };
}
