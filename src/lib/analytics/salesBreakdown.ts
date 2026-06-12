/**
 * 売上分析 (Sales breakdown) — server-side aggregation.
 *
 * `documents` を期間内 (issued_at >= now - window、status は draft/cancelled を
 * 除く) で集計し、以下 3 軸の内訳を返す:
 *   1. 施工種別 (doc_type) 別売上
 *   2. 車種別 (vehicles.maker / vehicle_info_json.maker) 別売上 (上位10件)
 *   3. 月次推移 (直近 N ヶ月)
 *
 * @security `tenantId` は呼び出し元 (resolveCallerWithRole) で検証済みである
 *   こと。createTenantScopedAdmin は RLS を bypass するため、クエリは
 *   `.eq("tenant_id", tenantId)` を必須とする。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type SalesWindow = "3m" | "6m" | "12m" | "24m";

export const SALES_WINDOW_LABEL: Record<SalesWindow, string> = {
  "3m": "3ヶ月",
  "6m": "6ヶ月",
  "12m": "12ヶ月",
  "24m": "24ヶ月",
};

export const SALES_WINDOW_MONTHS: Record<SalesWindow, number> = {
  "3m": 3,
  "6m": 6,
  "12m": 12,
  "24m": 24,
};

export interface SalesBreakdownResult {
  /** 施工種別 (doc_type) 別 */
  by_doc_type: Array<{ doc_type: string; total_revenue: number; count: number }>;
  /** 車種別 上位10件 */
  by_maker: Array<{ maker: string; total_revenue: number; count: number }>;
  /** 月次推移 (古い順、YYYY-MM) */
  monthly: Array<{ month: string; total_revenue: number; count: number }>;
  /** 集計期間 (ISO date, YYYY-MM-DD) */
  from: string;
  to: string;
  /** 期間全体の合計 */
  totals: { total_revenue: number; count: number };
  window: SalesWindow;
}

/** "YYYY-MM" を返す。 */
function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/**
 * 集計期間の境界を求める。`to` は本日 (排他ではなく当日を含む)。
 * `from` は (N-1) ヶ月前の月初 (=直近 N ヶ月ぶんの月次バケットを完全に含む)。
 */
function resolveRange(window: SalesWindow, now = new Date()): { from: string; to: string; months: string[] } {
  const months = SALES_WINDOW_MONTHS[window];
  const toY = now.getFullYear();
  const toM = now.getMonth();
  const toDay = now.getDate();
  const to = `${toY}-${String(toM + 1).padStart(2, "0")}-${String(toDay).padStart(2, "0")}`;

  // 月初基準 (N-1 ヶ月前の 1 日) から集計する。
  const fromDate = new Date(toY, toM - (months - 1), 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-01`;

  // 月軸を materialize (古い順)。欠損月もゼロ埋めできるようにする。
  const axis: string[] = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth() + i, 1);
    axis.push(monthKey(d.getFullYear(), d.getMonth()));
  }

  return { from, to, months: axis };
}

type DocRow = {
  doc_type: string | null;
  total: number | string | null;
  issued_at: string | null;
  vehicle_info_json: { maker?: string | null } | null;
  vehicle: { maker: string | null } | null;
};

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 除外ステータス (集計対象外)。 */
const EXCLUDED_STATUS = ["draft", "cancelled"] as const;

const UNKNOWN_MAKER = "不明";

export async function getSalesBreakdown(params: {
  tenantId: string;
  window: SalesWindow;
}): Promise<SalesBreakdownResult> {
  const { tenantId, window } = params;
  const { admin } = createTenantScopedAdmin(tenantId);
  const { from, to, months } = resolveRange(window);

  const { data, error } = await admin
    .from("documents")
    .select("doc_type, total, issued_at, vehicle_info_json, vehicle:vehicles(maker)")
    .eq("tenant_id", tenantId)
    .gte("issued_at", from)
    .not("status", "in", `(${EXCLUDED_STATUS.join(",")})`);

  if (error) {
    logger.error("salesBreakdown: query failed", { error: error.message, tenantId });
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as DocRow[];

  const docTypeMap = new Map<string, { total_revenue: number; count: number }>();
  const makerMap = new Map<string, { total_revenue: number; count: number }>();
  const monthlyMap = new Map<string, { total_revenue: number; count: number }>();
  for (const m of months) monthlyMap.set(m, { total_revenue: 0, count: 0 });

  let grandTotal = 0;
  let grandCount = 0;

  for (const row of rows) {
    const amount = toNum(row.total);

    // 施工種別
    const dt = row.doc_type ?? "other";
    const dtEntry = docTypeMap.get(dt) ?? { total_revenue: 0, count: 0 };
    dtEntry.total_revenue += amount;
    dtEntry.count += 1;
    docTypeMap.set(dt, dtEntry);

    // 車種別 (FK 優先、無ければ vehicle_info_json.maker、それも無ければ「不明」)
    const makerRaw = (row.vehicle?.maker ?? "").trim() || (row.vehicle_info_json?.maker ?? "").trim() || UNKNOWN_MAKER;
    const mkEntry = makerMap.get(makerRaw) ?? { total_revenue: 0, count: 0 };
    mkEntry.total_revenue += amount;
    mkEntry.count += 1;
    makerMap.set(makerRaw, mkEntry);

    // 月次推移
    const mk = (row.issued_at ?? "").slice(0, 7); // "YYYY-MM"
    const monthEntry = monthlyMap.get(mk);
    if (monthEntry) {
      monthEntry.total_revenue += amount;
      monthEntry.count += 1;
    }

    grandTotal += amount;
    grandCount += 1;
  }

  const by_doc_type = Array.from(docTypeMap.entries())
    .map(([doc_type, v]) => ({ doc_type, total_revenue: v.total_revenue, count: v.count }))
    .sort((a, b) => b.total_revenue - a.total_revenue);

  const by_maker = Array.from(makerMap.entries())
    .map(([maker, v]) => ({ maker, total_revenue: v.total_revenue, count: v.count }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);

  const monthly = months.map((m) => {
    const v = monthlyMap.get(m) ?? { total_revenue: 0, count: 0 };
    return { month: m, total_revenue: v.total_revenue, count: v.count };
  });

  return {
    by_doc_type,
    by_maker,
    monthly,
    from,
    to,
    totals: { total_revenue: grandTotal, count: grandCount },
    window,
  };
}
