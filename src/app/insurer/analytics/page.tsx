"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DailyCount = { date: string; count: number };
type Keyword = { keyword: string; count: number };
type ActionBreakdown = { action: string; count: number };

type AnalyticsData = {
  daily_counts: DailyCount[];
  top_keywords: Keyword[];
  action_breakdown: ActionBreakdown[];
};

const ACTION_COLORS: Record<string, string> = {
  search: "bg-blue-500",
  view: "bg-emerald-500",
  export: "bg-amber-500",
  case_create: "bg-purple-500",
  login: "bg-neutral-500",
};

function getActionColor(action: string): string {
  return ACTION_COLORS[action] ?? "bg-neutral-400";
}

const ACTION_LABELS: Record<string, string> = {
  search: "検索",
  view: "閲覧",
  export: "エクスポート",
  case_create: "案件作成",
  login: "ログイン",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/insurer/analytics");
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.message ?? `HTTP ${res.status}`);
        }
        setData(await res.json());
      } catch (e: any) {
        setError(e?.message ?? "データの取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxDaily = data
    ? Math.max(...data.daily_counts.map((d) => d.count), 1)
    : 1;

  const totalActions = data
    ? data.action_breakdown.reduce((sum, a) => sum + a.count, 0)
    : 0;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              ANALYTICS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                検索分析ダッシュボード
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                過去30日間の検索・閲覧・エクスポート状況を分析します。
              </p>
            </div>
          </div>
          <Link
            href="/insurer"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ダッシュボードへ
          </Link>
        </header>

        {loading && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
            読み込み中...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Daily counts bar chart */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                  DAILY SEARCH VOLUME
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  検索回数推移（過去30日）
                </div>
              </div>
              <div className="flex items-end gap-[2px] h-40 overflow-x-auto">
                {data.daily_counts.map((d) => {
                  const pct = maxDaily > 0 ? (d.count / maxDaily) * 100 : 0;
                  return (
                    <div
                      key={d.date}
                      className="group relative flex flex-col items-center flex-1 min-w-[8px]"
                      title={`${d.date}: ${d.count}件`}
                    >
                      <div
                        className="w-full rounded-t bg-blue-500 transition-colors hover:bg-blue-600"
                        style={{
                          height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%`,
                          minHeight: d.count > 0 ? "4px" : "0px",
                        }}
                      />
                      <div className="absolute -top-6 hidden group-hover:block rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-white whitespace-nowrap">
                        {d.date.slice(5)}: {d.count}件
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
                <span>{data.daily_counts[0]?.date.slice(5) ?? ""}</span>
                <span>
                  {data.daily_counts[data.daily_counts.length - 1]?.date.slice(5) ?? ""}
                </span>
              </div>
            </section>

            {/* Two columns: keywords + action breakdown */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top keywords */}
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                    TOP KEYWORDS
                  </div>
                  <div className="mt-1 text-lg font-semibold text-neutral-900">
                    よく検索されるキーワード TOP10
                  </div>
                </div>
                {data.top_keywords.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    検索データがありません。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.top_keywords.map((kw, i) => {
                      const maxKw = data.top_keywords[0]?.count ?? 1;
                      const pct = (kw.count / maxKw) * 100;
                      return (
                        <div key={kw.keyword} className="flex items-center gap-3">
                          <span className="w-5 text-right text-xs font-semibold text-neutral-400">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-neutral-900">
                                {kw.keyword}
                              </span>
                              <span className="text-neutral-500">
                                {kw.count}回
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-100">
                              <div
                                className="h-1.5 rounded-full bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Action breakdown */}
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                    ACTION BREAKDOWN
                  </div>
                  <div className="mt-1 text-lg font-semibold text-neutral-900">
                    アクション別内訳
                  </div>
                </div>
                {data.action_breakdown.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    アクションデータがありません。
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.action_breakdown.map((a) => {
                      const pct =
                        totalActions > 0
                          ? Math.round((a.count / totalActions) * 100)
                          : 0;
                      return (
                        <div key={a.action}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-3 w-3 rounded-full ${getActionColor(a.action)}`}
                              />
                              <span className="font-medium text-neutral-900">
                                {getActionLabel(a.action)}
                              </span>
                            </div>
                            <span className="text-neutral-500">
                              {a.count}回 ({pct}%)
                            </span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-neutral-100">
                            <div
                              className={`h-2 rounded-full ${getActionColor(a.action)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-neutral-100 text-sm text-neutral-500">
                      合計: {totalActions}件
                    </div>
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
