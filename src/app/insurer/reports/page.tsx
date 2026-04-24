"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState } from "react";
import Link from "next/link";

type PeriodTrend = { label: string; count: number };
type StatusBreakdown = { status: string; count: number };
type CategoryBreakdown = { category: string; count: number };

type ReportsData = {
  period: string;
  period_trend: PeriodTrend[];
  status_breakdown: StatusBreakdown[];
  category_breakdown: CategoryBreakdown[];
  avg_resolution_hours: number | null;
  total_cases: number;
  resolved_cases: number;
};

const STATUS_LABELS: Record<string, string> = {
  open: "未対応",
  in_progress: "対応中",
  pending_tenant: "テナント確認待ち",
  resolved: "解決済み",
  closed: "クローズ",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500",
  in_progress: "bg-amber-500",
  pending_tenant: "bg-blue-400",
  resolved: "bg-emerald-500",
  closed: "bg-neutral-400",
};

function getStatusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

function getStatusColor(s: string): string {
  return STATUS_COLORS[s] ?? "bg-neutral-400";
}

function formatHours(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}分`;
  if (hours < 24) return `${hours}時間`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}日`;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<"monthly" | "weekly">("monthly");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/insurer/reports?period=${period}`);
        if (!res.ok) {
          const j = await parseJsonSafe(res);
          throw new Error(j?.message ?? `HTTP ${res.status}`);
        }
        setData(await res.json());
      } catch (e: any) {
        setError(e?.message ?? "データの取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const maxTrend = data ? Math.max(...data.period_trend.map((d) => d.count), 1) : 1;

  const totalStatus = data ? data.status_breakdown.reduce((s, b) => s + b.count, 0) : 0;

  const totalCategory = data ? data.category_breakdown.reduce((s, b) => s + b.count, 0) : 0;

  return (
    <main className="min-h-screen bg-inset p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary">
              REPORTS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-primary">案件レポート</h1>
              <p className="mt-2 text-sm text-secondary">案件の推移・ステータス・カテゴリ・対応時間を分析します。</p>
            </div>
          </div>
          <Link
            href="/insurer"
            className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
          >
            ダッシュボードへ
          </Link>
        </header>

        {/* Period toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod("monthly")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              period === "monthly"
                ? "bg-neutral-900 text-white"
                : "border border-border-default bg-surface text-secondary hover:bg-surface-hover"
            }`}
          >
            月次
          </button>
          <button
            onClick={() => setPeriod("weekly")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              period === "weekly"
                ? "bg-neutral-900 text-white"
                : "border border-border-default bg-surface text-secondary hover:bg-surface-hover"
            }`}
          >
            週次
          </button>
        </div>

        {loading && (
          <div className="rounded-2xl border border-border-default bg-surface p-8 text-center text-sm text-muted">
            読み込み中...
          </div>
        )}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>}

        {data && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">TOTAL CASES</div>
                <div className="mt-2 text-3xl font-bold text-primary">{data.total_cases}</div>
                <div className="mt-1 text-sm text-muted">{period === "monthly" ? "過去12ヶ月" : "過去12週"}</div>
              </div>
              <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">RESOLVED</div>
                <div className="mt-2 text-3xl font-bold text-emerald-600">{data.resolved_cases}</div>
                <div className="mt-1 text-sm text-muted">解決済み件数</div>
              </div>
              <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">AVG RESOLUTION TIME</div>
                <div className="mt-2 text-3xl font-bold text-blue-600">{formatHours(data.avg_resolution_hours)}</div>
                <div className="mt-1 text-sm text-muted">平均対応時間</div>
              </div>
            </div>

            {/* Period trend bar chart */}
            <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">CASE TREND</div>
                <div className="mt-1 text-lg font-semibold text-primary">案件件数推移</div>
              </div>
              {data.period_trend.length === 0 ? (
                <p className="text-sm text-muted">データがありません。</p>
              ) : (
                <>
                  <div className="flex items-end gap-1 h-40">
                    {data.period_trend.map((d) => {
                      const pct = maxTrend > 0 ? (d.count / maxTrend) * 100 : 0;
                      return (
                        <div
                          key={d.label}
                          className="group relative flex flex-col items-center flex-1 min-w-[20px]"
                          title={`${d.label}: ${d.count}件`}
                        >
                          <div
                            className="w-full rounded-t bg-neutral-800 transition-colors hover:bg-neutral-700"
                            style={{
                              height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%`,
                              minHeight: d.count > 0 ? "4px" : "0px",
                            }}
                          />
                          <div className="absolute -top-6 hidden group-hover:block rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-white whitespace-nowrap">
                            {d.label}: {d.count}件
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-muted">
                    <span>{data.period_trend[0]?.label ?? ""}</span>
                    <span>{data.period_trend[data.period_trend.length - 1]?.label ?? ""}</span>
                  </div>
                </>
              )}
            </section>

            {/* Two columns: status + category */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Status breakdown */}
              <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-muted">STATUS BREAKDOWN</div>
                  <div className="mt-1 text-lg font-semibold text-primary">ステータス別内訳</div>
                </div>
                {data.status_breakdown.length === 0 ? (
                  <p className="text-sm text-muted">データがありません。</p>
                ) : (
                  <div className="space-y-3">
                    {data.status_breakdown.map((s) => {
                      const pct = totalStatus > 0 ? Math.round((s.count / totalStatus) * 100) : 0;
                      return (
                        <div key={s.status}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className={`h-3 w-3 rounded-full ${getStatusColor(s.status)}`} />
                              <span className="font-medium text-primary">{getStatusLabel(s.status)}</span>
                            </div>
                            <span className="text-muted">
                              {s.count}件 ({pct}%)
                            </span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-surface-hover">
                            <div
                              className={`h-2 rounded-full ${getStatusColor(s.status)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Category breakdown */}
              <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-muted">CATEGORY BREAKDOWN</div>
                  <div className="mt-1 text-lg font-semibold text-primary">カテゴリ別内訳</div>
                </div>
                {data.category_breakdown.length === 0 ? (
                  <p className="text-sm text-muted">データがありません。</p>
                ) : (
                  <div className="space-y-3">
                    {data.category_breakdown.map((c) => {
                      const pct = totalCategory > 0 ? Math.round((c.count / totalCategory) * 100) : 0;
                      return (
                        <div key={c.category}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-primary">{c.category}</span>
                            <span className="text-muted">
                              {c.count}件 ({pct}%)
                            </span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-surface-hover">
                            <div className="h-2 rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
