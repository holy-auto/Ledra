"use client";

import { useEffect, useState } from "react";
import { formatJpy } from "@/lib/format";

type MonthData = {
  month: string;
  label: string;
  invoiceTotal: number;
  documentTotal: number;
  combinedTotal: number;
  count: number;
};

type YearData = {
  year: string;
  total: number;
  count: number;
};

type AnalyticsData = {
  months: MonthData[];
  years: YearData[];
  current: {
    month: number;
    monthLabel: string;
    prevMonth: number;
    prevMonthLabel: string;
    lastYearSameMonth: number;
    lastYearLabel: string;
    monthGrowthRate: number | null;
    yearGrowthRate: number | null;
  };
  summary: {
    totalRevenue: number;
    estimatePipeline: number;
    maxMonthTotal: number;
    totalCount: number;
  };
};

function GrowthBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-[11px] text-[#aeaeb2]">- データなし</span>;
  const isPositive = rate >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold"
      style={{ color: isPositive ? "#34c759" : "#ff3b30" }}
    >
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={isPositive ? "M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" : "M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25"}
        />
      </svg>
      {isPositive ? "+" : ""}{rate.toFixed(1)}%
    </span>
  );
}

export default function RevenueAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/billing-analytics", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (res.ok && j) setData(j);
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="glass-card p-6 animate-pulse space-y-4">
        <div className="h-4 w-32 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="h-40 rounded bg-[rgba(0,0,0,0.04)]" />
      </div>
    );
  }

  if (!data) return null;

  const { months, years, current, summary } = data;

  // Get last 6 months for chart display
  const chartMonths = months.slice(-6);
  const maxVal = Math.max(...chartMonths.map((m) => m.combinedTotal), 1);

  return (
    <div className="space-y-4">
      {/* Revenue Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current month */}
        <div className="glass-card p-4 space-y-1">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">今月の売上</div>
          <div className="text-xl font-bold text-primary">{formatJpy(current.month)}</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#aeaeb2]">前月比</span>
            <GrowthBadge rate={current.monthGrowthRate} />
          </div>
        </div>

        {/* Previous month */}
        <div className="glass-card p-4 space-y-1">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">前月</div>
          <div className="text-xl font-bold text-primary">{formatJpy(current.prevMonth)}</div>
          <div className="text-[11px] text-[#aeaeb2]">{current.prevMonthLabel}</div>
        </div>

        {/* Year over year */}
        <div className="glass-card p-4 space-y-1">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">前年同月比</div>
          <div className="text-xl font-bold text-primary">{formatJpy(current.lastYearSameMonth)}</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#aeaeb2]">{current.lastYearLabel}</span>
            <GrowthBadge rate={current.yearGrowthRate} />
          </div>
        </div>

        {/* Estimate pipeline */}
        <div className="glass-card p-4 space-y-1">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">見積パイプライン</div>
          <div className="text-xl font-bold text-[#ff9500]">{formatJpy(summary.estimatePipeline)}</div>
          <div className="text-[11px] text-[#aeaeb2]">未確定の見積合計</div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">REVENUE CHART</div>
            <div className="mt-0.5 text-[15px] font-semibold text-primary">売上推移</div>
          </div>
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "rgba(0,0,0,0.04)" }}>
            <button
              type="button"
              onClick={() => setViewMode("monthly")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                viewMode === "monthly"
                  ? "bg-white text-[#0071e3] shadow-sm"
                  : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              月別
            </button>
            <button
              type="button"
              onClick={() => setViewMode("yearly")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                viewMode === "yearly"
                  ? "bg-white text-[#0071e3] shadow-sm"
                  : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              年別
            </button>
          </div>
        </div>

        {viewMode === "monthly" ? (
          <>
            {/* Monthly Bar Chart */}
            <div className="flex items-end gap-2 h-44">
              {chartMonths.map((m, idx) => {
                const height = maxVal > 0 ? (m.combinedTotal / maxVal) * 100 : 0;
                const isCurrentMonth = idx === chartMonths.length - 1;
                const prevMonthTotal = idx > 0 ? chartMonths[idx - 1].combinedTotal : 0;
                const growth = prevMonthTotal > 0
                  ? ((m.combinedTotal - prevMonthTotal) / prevMonthTotal * 100)
                  : null;

                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                    {/* Value label on hover */}
                    <div className="text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {formatJpy(m.combinedTotal)}
                    </div>
                    {/* Growth indicator */}
                    <div className="h-4 flex items-center">
                      {growth !== null && m.combinedTotal > 0 && (
                        <span
                          className="text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: growth >= 0 ? "#34c759" : "#ff3b30" }}
                        >
                          {growth >= 0 ? "+" : ""}{growth.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {/* Bar */}
                    <div
                      className="w-full rounded-t-lg transition-all duration-500 ease-out min-h-[4px]"
                      style={{
                        height: `${Math.max(height, 3)}%`,
                        background: isCurrentMonth
                          ? "linear-gradient(180deg, #0071e3, #5856d6)"
                          : m.combinedTotal > 0
                            ? "linear-gradient(180deg, rgba(0,113,227,0.3), rgba(88,86,214,0.2))"
                            : "rgba(0,0,0,0.04)",
                      }}
                    />
                    {/* Month label */}
                    <div className={`text-[10px] mt-1 ${isCurrentMonth ? "font-semibold text-[#0071e3]" : "text-[#aeaeb2]"}`}>
                      {m.label.replace(/^\d+年/, "")}
                    </div>
                    {/* Count */}
                    <div className="text-[9px] text-[#aeaeb2]">
                      {m.count}件
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Monthly Table */}
            <div className="border-t border-border-subtle pt-3">
              <div className="overflow-x-auto">
                <table className="min-w-full text-[12px]">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">月</th>
                      <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">請求書</th>
                      <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">帳票</th>
                      <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">合計</th>
                      <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">件数</th>
                      <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">前月比</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {[...months].reverse().map((m, idx, arr) => {
                      const prevMonth = arr[idx + 1];
                      const growth = prevMonth && prevMonth.combinedTotal > 0
                        ? ((m.combinedTotal - prevMonth.combinedTotal) / prevMonth.combinedTotal * 100)
                        : null;
                      return (
                        <tr key={m.month} className={idx === 0 ? "bg-[rgba(0,113,227,0.03)]" : ""}>
                          <td className="py-2 px-2 text-secondary font-medium">{m.label}</td>
                          <td className="py-2 px-2 text-right text-secondary">{formatJpy(m.invoiceTotal)}</td>
                          <td className="py-2 px-2 text-right text-secondary">{formatJpy(m.documentTotal)}</td>
                          <td className="py-2 px-2 text-right font-semibold text-primary">{formatJpy(m.combinedTotal)}</td>
                          <td className="py-2 px-2 text-right text-[#aeaeb2]">{m.count}</td>
                          <td className="py-2 px-2 text-right">
                            {growth !== null && m.combinedTotal > 0 ? (
                              <span style={{ color: growth >= 0 ? "#34c759" : "#ff3b30" }}>
                                {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[#aeaeb2]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Yearly View */}
            <div className="flex items-end gap-4 h-44 px-8">
              {years.map((y, idx) => {
                const yearMax = Math.max(...years.map((yr) => yr.total), 1);
                const height = yearMax > 0 ? (y.total / yearMax) * 100 : 0;
                const prevYear = years[idx - 1];
                const growth = prevYear && prevYear.total > 0
                  ? ((y.total - prevYear.total) / prevYear.total * 100)
                  : null;

                return (
                  <div key={y.year} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="text-[11px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatJpy(y.total)}
                    </div>
                    <div className="h-4 flex items-center">
                      {growth !== null && (
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: growth >= 0 ? "#34c759" : "#ff3b30" }}
                        >
                          {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div
                      className="w-full rounded-t-lg transition-all duration-500 ease-out min-h-[4px]"
                      style={{
                        height: `${Math.max(height, 3)}%`,
                        background: idx === years.length - 1
                          ? "linear-gradient(180deg, #0071e3, #5856d6)"
                          : "linear-gradient(180deg, rgba(0,113,227,0.3), rgba(88,86,214,0.2))",
                      }}
                    />
                    <div className={`text-[12px] mt-1 font-semibold ${idx === years.length - 1 ? "text-[#0071e3]" : "text-[#6e6e73]"}`}>
                      {y.year}年
                    </div>
                    <div className="text-[10px] text-[#aeaeb2]">{y.count}件</div>
                  </div>
                );
              })}
            </div>

            {/* Yearly summary table */}
            <div className="border-t border-border-subtle pt-3">
              <table className="min-w-full text-[12px]">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">年度</th>
                    <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">年間売上</th>
                    <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">件数</th>
                    <th className="text-right py-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted">前年比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {[...years].reverse().map((y, idx, arr) => {
                    const prevYear = arr[idx + 1];
                    const growth = prevYear && prevYear.total > 0
                      ? ((y.total - prevYear.total) / prevYear.total * 100)
                      : null;
                    return (
                      <tr key={y.year} className={idx === 0 ? "bg-[rgba(0,113,227,0.03)]" : ""}>
                        <td className="py-2 px-2 font-semibold text-primary">{y.year}年</td>
                        <td className="py-2 px-2 text-right font-semibold text-primary">{formatJpy(y.total)}</td>
                        <td className="py-2 px-2 text-right text-[#aeaeb2]">{y.count}</td>
                        <td className="py-2 px-2 text-right">
                          {growth !== null ? (
                            <span style={{ color: growth >= 0 ? "#34c759" : "#ff3b30" }}>
                              {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#aeaeb2]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
