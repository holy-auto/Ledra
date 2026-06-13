"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";

// ─── 型定義 ──────────────────────────────────────────────────────
interface TechnicianRow {
  user_id: string | null;
  name: string;
  invoice_count: number;
  total_revenue: number;
  avg_revenue_per_invoice: number;
  completed_count: number;
  completion_rate: number;
}

interface PerformanceResponse {
  ok: boolean;
  from: string;
  to: string;
  technicians: TechnicianRow[];
  totals: { invoice_count: number; total_revenue: number; completed_count: number };
}

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

function jpy(n: number): string {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// 当月初・月末をデフォルトに。
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function TechnicianPerformanceClient() {
  const def = currentMonthRange();
  const [from, setFrom] = useState<string>(def.from);
  const [to, setTo] = useState<string>(def.to);
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/technician-performance?from=${from}&to=${to}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as PerformanceResponse;
      setData(json);
    } catch {
      showToast("データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.technicians ?? [];
  const totals = data?.totals ?? { invoice_count: 0, total_revenue: 0, completed_count: 0 };
  // バーの相対長: 最大売上を 100% とする。
  const maxRevenue = rows.reduce((m, r) => Math.max(m, r.total_revenue), 0);

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        tag="分析"
        title="技術者別パフォーマンス"
        description="施工担当者ごとの請求件数・売上・平均単価・完了率を集計します。担当が未設定の請求書は「未割当」に集計されます。"
      />

      {/* 期間フィルタ */}
      <div className="glass-card flex flex-wrap items-end gap-4 p-4">
        <label className="flex flex-col gap-1 text-xs text-secondary">
          開始日
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          終了日
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <button onClick={fetchData} disabled={loading} className="btn-primary disabled:opacity-40">
          集計する
        </button>
        <div className="ml-auto flex gap-4 text-sm">
          <div className="text-secondary">
            合計売上 <span className="font-semibold text-primary">{jpy(totals.total_revenue)}</span>
          </div>
          <div className="text-secondary">
            合計件数 <span className="font-semibold text-primary">{totals.invoice_count}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-card flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">対象期間にデータがありません。</div>
      ) : (
        <>
          {/* バーチャート (純CSS) */}
          <section className="glass-card space-y-3 p-5">
            <div className="text-sm font-semibold text-primary">担当者別 売上</div>
            <div className="space-y-2.5">
              {rows.map((r) => (
                <div key={r.user_id ?? "unassigned"} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-xs text-secondary" title={r.name}>
                    {r.name}
                  </div>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-surface-hover">
                    <div
                      className={`h-full rounded ${r.user_id === null ? "bg-border-default" : "bg-accent"}`}
                      style={{ width: maxRevenue > 0 ? `${Math.max(2, (r.total_revenue / maxRevenue) * 100)}%` : "0%" }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-xs font-semibold text-primary">
                    {jpy(r.total_revenue)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* テーブル */}
          <section className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <Th>担当者</Th>
                    <Th align="right">件数</Th>
                    <Th align="right">売上合計</Th>
                    <Th align="right">平均単価</Th>
                    <Th align="right">完了率</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {rows.map((r) => (
                    <tr key={r.user_id ?? "unassigned"} className="hover:bg-surface-hover/60">
                      <td className="p-3 text-primary">
                        {r.user_id === null ? <span className="text-muted">未割当</span> : r.name}
                      </td>
                      <td className="p-3 text-right text-secondary">{r.invoice_count.toLocaleString("ja-JP")}</td>
                      <td className="p-3 text-right font-semibold text-primary">{jpy(r.total_revenue)}</td>
                      <td className="p-3 text-right text-secondary">{jpy(r.avg_revenue_per_invoice)}</td>
                      <td className="p-3 text-right text-secondary">
                        {pct(r.completion_rate)}
                        <span className="ml-1 text-[11px] text-muted">
                          ({r.completed_count}/{r.invoice_count})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-danger px-5 py-3 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── 小コンポーネント ─────────────────────────────────────────────
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`p-3 text-xs font-semibold tracking-[0.12em] text-muted ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}
