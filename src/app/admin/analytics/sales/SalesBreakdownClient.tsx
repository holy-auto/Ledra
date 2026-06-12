"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { SALES_WINDOW_LABEL, type SalesBreakdownResult, type SalesWindow } from "@/lib/analytics/salesBreakdown";

type Props = {
  initial: SalesBreakdownResult;
};

const WINDOWS: SalesWindow[] = ["3m", "6m", "12m", "24m"];

/** 施工種別ラベル。 */
const DOC_TYPE_LABEL: Record<string, string> = {
  estimate: "見積",
  delivery: "納品書",
  purchase_order: "発注書",
  order_confirmation: "発注請書",
  inspection: "検収書",
  receipt: "領収書",
  invoice: "請求書",
  consolidated_invoice: "合算請求書",
  quote: "概算見積",
  other: "その他",
};

/** 施工種別の積み上げバー用カラー (Tailwind bg)。 */
const DOC_TYPE_COLOR: Record<string, string> = {
  estimate: "bg-sky-500",
  invoice: "bg-emerald-500",
  receipt: "bg-amber-500",
  consolidated_invoice: "bg-teal-500",
  delivery: "bg-indigo-500",
  purchase_order: "bg-fuchsia-500",
  order_confirmation: "bg-rose-500",
  inspection: "bg-lime-500",
  quote: "bg-violet-500",
  other: "bg-zinc-400",
};

const FALLBACK_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-lime-500",
  "bg-fuchsia-500",
  "bg-zinc-400",
];

function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function num(n: number): string {
  return n.toLocaleString("ja-JP");
}

function docTypeLabel(dt: string): string {
  return DOC_TYPE_LABEL[dt] ?? dt;
}

function docTypeColor(dt: string, index: number): string {
  return DOC_TYPE_COLOR[dt] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/** YYYY-MM → "YYYY年MM月" */
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return y && mo ? `${y}年${mo}月` : m;
}

export default function SalesBreakdownClient({ initial }: Props) {
  const router = useRouter();
  const data = initial;
  const window = initial.window;

  function changeWindow(next: SalesWindow) {
    if (next === window) return;
    router.push(`/admin/analytics/sales?window=${next}`, { scroll: false });
  }

  const maxMonthly = useMemo(() => data.monthly.reduce((max, m) => Math.max(max, m.total_revenue), 0), [data.monthly]);
  const maxMaker = useMemo(() => data.by_maker.reduce((max, m) => Math.max(max, m.total_revenue), 0), [data.by_maker]);
  const docTypeTotal = useMemo(() => data.by_doc_type.reduce((sum, d) => sum + d.total_revenue, 0), [data.by_doc_type]);

  const hasData = data.totals.count > 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Analytics</p>
          <h1 className="text-2xl font-bold text-primary">売上分析ダッシュボード</h1>
          <p className="mt-1 text-sm text-secondary">施工種別・車種別・月次推移で売上の内訳を可視化します。</p>
        </div>
        <div className="flex items-center gap-2" role="tablist" aria-label="集計期間">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={w === window}
              onClick={() => changeWindow(w)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                w === window
                  ? "border-accent bg-accent text-white"
                  : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover"
              }`}
            >
              {SALES_WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
      </header>

      {/* サマリー */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">期間合計売上</div>
          <div className="mt-2 text-2xl font-bold text-primary">{yen(data.totals.total_revenue)}</div>
          <div className="mt-1 text-xs text-muted">
            {data.from} 〜 {data.to}
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">帳票件数</div>
          <div className="mt-2 text-2xl font-bold text-primary">{num(data.totals.count)}件</div>
          <div className="mt-1 text-xs text-muted">下書き・キャンセルを除く</div>
        </div>
      </section>

      {!hasData && (
        <div className="glass-card p-8 text-center text-sm text-muted">この期間に売上データがありません。</div>
      )}

      {hasData && (
        <>
          {/* 月次推移 */}
          <section className="glass-card p-5">
            <h2 className="text-sm font-semibold tracking-[0.12em] text-muted">月次推移</h2>
            <div className="mt-4 space-y-2.5">
              {data.monthly.map((m) => {
                const pct = maxMonthly > 0 ? (m.total_revenue / maxMonthly) * 100 : 0;
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 text-xs text-secondary">{monthLabel(m.month)}</div>
                    <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-hover">
                      <div
                        className="h-full rounded bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    </div>
                    <div className="w-44 shrink-0 text-right text-xs tabular-nums text-secondary">
                      {yen(m.total_revenue)}
                      <span className="ml-2 text-muted">{num(m.count)}件</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 施工種別 */}
          <section className="glass-card p-5">
            <h2 className="text-sm font-semibold tracking-[0.12em] text-muted">施工種別 (帳票種別)</h2>
            {docTypeTotal > 0 ? (
              <>
                <div className="mt-4 flex h-6 w-full overflow-hidden rounded-full">
                  {data.by_doc_type.map((d, i) => {
                    const pct = (d.total_revenue / docTypeTotal) * 100;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={d.doc_type}
                        className={docTypeColor(d.doc_type, i)}
                        style={{ width: `${pct}%` }}
                        title={`${docTypeLabel(d.doc_type)} ${yen(d.total_revenue)}`}
                        aria-hidden
                      />
                    );
                  })}
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {data.by_doc_type.map((d, i) => {
                    const pct = (d.total_revenue / docTypeTotal) * 100;
                    return (
                      <li key={d.doc_type} className="flex items-center gap-2 text-sm">
                        <span className={`h-3 w-3 shrink-0 rounded-sm ${docTypeColor(d.doc_type, i)}`} aria-hidden />
                        <span className="text-secondary">{docTypeLabel(d.doc_type)}</span>
                        <span className="ml-auto tabular-nums text-primary">{yen(d.total_revenue)}</span>
                        <span className="w-14 text-right text-xs tabular-nums text-muted">{pct.toFixed(1)}%</span>
                        <span className="w-12 text-right text-xs tabular-nums text-muted">{num(d.count)}件</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="mt-4 text-sm text-muted">データがありません。</div>
            )}
          </section>

          {/* 車種別 Top 10 */}
          <section className="glass-card p-5">
            <h2 className="text-sm font-semibold tracking-[0.12em] text-muted">車種別 Top 10 (メーカー)</h2>
            <div className="mt-4 space-y-2.5">
              {data.by_maker.map((mk, i) => {
                const pct = maxMaker > 0 ? (mk.total_revenue / maxMaker) * 100 : 0;
                return (
                  <div key={mk.maker} className="flex items-center gap-3">
                    <div className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">{i + 1}</div>
                    <div className="w-28 shrink-0 truncate text-xs text-secondary" title={mk.maker}>
                      {mk.maker}
                    </div>
                    <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-hover">
                      <div
                        className="h-full rounded bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    </div>
                    <div className="w-44 shrink-0 text-right text-xs tabular-nums text-secondary">
                      {yen(mk.total_revenue)}
                      <span className="ml-2 text-muted">{num(mk.count)}件</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
