"use client";

import { useState, useTransition } from "react";
import { formatJpy } from "@/lib/format";
import type { PricingContext } from "@/lib/ai/pricingIntelligence";

type Props = {
  initial: PricingContext;
};

function fmtRate(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function fmtTimestamp(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString("ja-JP");
}

export default function PricingIntelligenceClient({ initial }: Props) {
  const [data, setData] = useState<PricingContext>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/analytics/pricing-intelligence?refresh=1", {
          cache: "no-store",
        });
        const json = (await res.json()) as PricingContext & { error?: string; message?: string };
        if (!res.ok) {
          setError(json.message ?? "読み込みに失敗しました。");
          return;
        }
        setData(json);
      } catch {
        setError("通信エラーが発生しました。");
      }
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-primary">AI 見積もり実勢価格</h1>
          <p className="mt-1 text-xs text-muted">
            分析基準: 過去365日間 / {data.total_invoices_analyzed.toLocaleString("ja-JP")}件の請求書
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted">最終更新: {fmtTimestamp(data.computed_at)}</span>
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {pending ? "更新中..." : "データを更新"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {data.patterns.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-surface px-4 py-10 text-center text-sm text-muted">
          成約済みの請求書がまだ十分にありません。請求書が蓄積されると実勢価格が表示されます。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">サービス名</th>
                <th className="px-3 py-2 font-medium">車種</th>
                <th className="px-3 py-2 text-right font-medium">サンプル数</th>
                <th className="px-3 py-2 text-right font-medium">中央値</th>
                <th className="px-3 py-2 text-right font-medium">P25</th>
                <th className="px-3 py-2 text-right font-medium">P75</th>
                <th className="px-3 py-2 text-right font-medium">成約率</th>
              </tr>
            </thead>
            <tbody>
              {data.patterns.map((p, i) => (
                <tr key={`${p.service_name}-${p.maker ?? "*"}-${i}`} className="border-b border-zinc-100">
                  <td className="px-3 py-2 text-primary">{p.service_name}</td>
                  <td className="px-3 py-2 text-secondary">{p.maker ?? "全車種"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-secondary">
                    {p.sample_count.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{formatJpy(p.median_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{formatJpy(p.p25_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{formatJpy(p.p75_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtRate(p.acceptance_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
