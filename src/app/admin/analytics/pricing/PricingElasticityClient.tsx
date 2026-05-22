"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatTile from "@/components/analytics/StatTile";
import Sparkline from "@/components/analytics/Sparkline";
import { formatJpy } from "@/lib/format";
import {
  PRICING_WINDOW_LABEL,
  type PricingElasticityResult,
  type PricingOfferingSummary,
  type PricingWindow,
} from "@/lib/analytics/pricing";

type Props = {
  initial: PricingElasticityResult;
};

const WINDOWS: PricingWindow[] = ["90d", "180d", "365d", "730d"];

function fmtNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function fmtPct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtPrice(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return formatJpy(Math.round(v));
}

/**
 * Heuristic for whether the offering shows clear price-elasticity
 * sensitivity: avg_estimated_amount and close_rate move in opposite
 * directions month-over-month with a meaningful sample.
 *
 * Returns one of:
 *   - "elastic"     — higher price ↔ lower close rate (and sample >= 6)
 *   - "inelastic"   — price moves but close rate stable
 *   - "insufficient" — too few completed reservations to judge
 */
function elasticityTag(o: PricingOfferingSummary): "elastic" | "inelastic" | "insufficient" {
  const settled = o.total_completed_count + o.total_cancelled_count;
  if (settled < 6) return "insufficient";

  // Pearson-like sign correlation across months where both metrics exist.
  const pairs: Array<{ price: number; close: number }> = [];
  for (const m of o.monthly) {
    if (m.avg_estimated_amount !== null && m.close_rate !== null && m.completed_count + m.cancelled_count >= 2) {
      pairs.push({ price: m.avg_estimated_amount, close: m.close_rate });
    }
  }
  if (pairs.length < 3) return "insufficient";

  const avgP = pairs.reduce((s, p) => s + p.price, 0) / pairs.length;
  const avgC = pairs.reduce((s, p) => s + p.close, 0) / pairs.length;
  const cov = pairs.reduce((s, p) => s + (p.price - avgP) * (p.close - avgC), 0);
  return cov < 0 ? "elastic" : "inelastic";
}

const ELASTICITY_BADGE: Record<ReturnType<typeof elasticityTag>, { label: string; tone: string }> = {
  elastic: { label: "価格感応", tone: "bg-rose-100 text-rose-700" },
  inelastic: { label: "価格非感応", tone: "bg-emerald-100 text-emerald-700" },
  insufficient: { label: "サンプル不足", tone: "bg-zinc-200 text-zinc-600" },
};

export default function PricingElasticityClient({ initial }: Props) {
  const router = useRouter();
  const [data, setData] = useState<PricingElasticityResult>(initial);
  const [window, setWindow] = useState<PricingWindow>(initial.window);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeWindow(next: PricingWindow) {
    if (next === window) return;
    setWindow(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/analytics/pricing?window=${next}`, { cache: "no-store" });
        const json = (await res.json()) as PricingElasticityResult & { error?: string; message?: string };
        if (!res.ok) {
          setError(json.message ?? "読み込みに失敗しました。");
          return;
        }
        setData(json);
        router.replace(`/admin/analytics/pricing?window=${next}`, { scroll: false });
      } catch {
        setError("通信に失敗しました。");
      }
    });
  }

  // Top 10 offerings by revenue to keep the table readable.
  const visible = useMemo(() => data.offerings.slice(0, 10), [data.offerings]);
  const hidden = data.offerings.length - visible.length;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-zinc-900">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Analytics</p>
          <h1 className="text-2xl font-bold">価格弾性ダッシュボード</h1>
          <p className="mt-1 text-sm text-zinc-600">
            予約タイトル単位で「平均価格 × 成約率 × 売上」の月次推移を可視化します。
          </p>
        </div>
        <div className="flex items-center gap-2" role="tablist" aria-label="期間">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={w === window}
              onClick={() => changeWindow(w)}
              disabled={pending}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                w === window
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {PRICING_WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="商品(タイトル)数" value={fmtNumber(data.totals.offering_count)} />
        <StatTile label="総予約数" value={fmtNumber(data.totals.total_reservations)} />
        <StatTile label="完了予約" value={fmtNumber(data.totals.total_completed)} />
        <StatTile label="完了売上" value={formatJpy(data.totals.total_revenue)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            商品別パフォーマンス (売上順 上位10件)
          </h2>
        </div>
        {visible.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-500">この期間に予約データがありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">商品(タイトル)</th>
                  <th className="px-4 py-3 text-center">弾性</th>
                  <th className="px-4 py-3 text-right">予約 / 完了</th>
                  <th className="px-4 py-3 text-right">成約率</th>
                  <th className="px-4 py-3 text-right">平均価格</th>
                  <th className="px-4 py-3 text-right">価格レンジ</th>
                  <th className="px-4 py-3 text-right">完了売上</th>
                  <th className="px-4 py-3 text-center">予約推移</th>
                  <th className="px-4 py-3 text-center">平均価格推移</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const tag = elasticityTag(o);
                  const badge = ELASTICITY_BADGE[tag];
                  const resTrend = o.monthly.map((m) => m.reservation_count);
                  const priceTrend = o.monthly.map((m) => m.avg_estimated_amount);
                  return (
                    <tr key={o.title} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium">{o.title}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtNumber(o.total_reservation_count)} / {fmtNumber(o.total_completed_count)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(o.overall_close_rate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPrice(o.avg_price_overall)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-zinc-500">
                        {o.min_price_overall !== null && o.max_price_overall !== null
                          ? `${formatJpy(o.min_price_overall)} – ${formatJpy(o.max_price_overall)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatJpy(o.total_revenue)}</td>
                      <td className="px-4 py-3">
                        <Sparkline
                          values={resTrend}
                          width={100}
                          height={28}
                          strokeClassName="stroke-zinc-700"
                          fillClassName="fill-zinc-300"
                          ariaLabel={`${o.title} の予約推移`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Sparkline
                          values={priceTrend}
                          width={100}
                          height={28}
                          strokeClassName="stroke-emerald-600"
                          fillClassName="fill-emerald-200"
                          ariaLabel={`${o.title} の平均価格推移`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hidden > 0 ? (
          <div className="border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">
            他 {fmtNumber(hidden)} 件の商品は表示されていません。
          </div>
        ) : null}
      </section>

      <footer className="space-y-1 text-xs text-zinc-500">
        <p>
          ※ 「弾性」タグは月次の平均価格と成約率の符号付き相関に基づくヒューリスティクス判定です (サンプル ≥
          3ヶ月、設定済み予約 ≥ 6件が必要)。
        </p>
        <p>※ 商品は予約タイトルでグループ化しています。タイトル表記が揺れる場合は別商品として集計されます。</p>
      </footer>
    </main>
  );
}
