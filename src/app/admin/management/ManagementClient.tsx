"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState } from "react";
import { formatJpy } from "@/lib/format";

type KPIData = {
  cashFlow: {
    totalCashIn: number;
    totalCashOut: number;
    operatingCF: number;
    thisMonth: { cashIn: number; cashOut: number; cf: number };
    lastMonth: { cashIn: number; cashOut: number; cf: number };
    cfGrowthRate: number | null;
    accountsReceivable: number;
    upcomingAR: number;
  };
  collection: {
    totalInvoiced: number;
    totalPaid: number;
    collectionRate: number | null;
    overdueCount: number;
    overdueAmount: number;
    dso: number | null;
  };
  customers: {
    total: number;
    activeCustomers: number;
    arpu: number | null;
    ltv: number | null;
    avgLifeMonths: number;
    growthByMonth: { month: string; label: string; count: number; cumulative: number }[];
  };
  profitability: {
    totalRevenue: number;
    totalPurchases: number;
    grossProfit: number;
    grossMarginRate: number | null;
  };
  conversion: {
    totalEstimates: number;
    convertedEstimates: number;
    conversionRate: number | null;
  };
  certificates: {
    total: number;
    active: number;
    byMonth: { month: string; label: string; count: number }[];
    avgServicePrice: number | null;
  };
};

/* ─── Helpers ─── */

function GrowthBadge({ rate, suffix = "%" }: { rate: number | null; suffix?: string }) {
  if (rate === null) return <span className="text-[11px] text-muted">-</span>;
  const isPositive = rate >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold"
      style={{ color: isPositive ? "var(--accent-emerald)" : "var(--accent-red)" }}
    >
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={isPositive ? "M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" : "M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25"}
        />
      </svg>
      {isPositive ? "+" : ""}
      {rate.toFixed(1)}
      {suffix}
    </span>
  );
}

function KPICard({
  tag,
  value,
  sub,
  color,
  danger,
}: {
  tag: string;
  value: string;
  sub?: string;
  color?: string;
  danger?: boolean;
}) {
  return (
    <div className="glass-card p-4 space-y-1">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">{tag}</div>
      <div className={`text-xl font-bold ${danger ? "text-danger" : ""}`} style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function MiniBar({
  data,
  maxVal,
  color = "var(--accent-blue)",
}: {
  data: { label: string; value: number }[];
  maxVal: number;
  color?: string;
}) {
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => {
        const h = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
            <div className="text-[8px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              {d.value}
            </div>
            <div
              className="w-full rounded-t min-h-[2px] transition-all"
              style={{ height: `${Math.max(h, 3)}%`, backgroundColor: d.value > 0 ? color : "rgba(0,0,0,0.04)" }}
            />
            <div className="text-[8px] text-muted">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressRing({
  rate,
  size = 80,
  color = "var(--accent-blue)",
}: {
  rate: number | null;
  size?: number;
  color?: string;
}) {
  const pct = rate ?? 0;
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[14px] font-bold text-primary">{rate !== null ? `${rate.toFixed(0)}%` : "-"}</span>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function ManagementClient() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/management-kpi", { cache: "no-store" });
        const j = await parseJsonSafe(res);
        if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
        setData(j);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-surface-hover" />
          <div className="h-8 w-48 rounded bg-surface-hover" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-5 space-y-2">
              <div className="h-3 w-16 rounded bg-surface-hover" />
              <div className="h-7 w-24 rounded bg-surface-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="glass-card p-4 text-sm text-red-500">{err}</div>
      </div>
    );
  }

  if (!data) return null;

  const { cashFlow, collection, customers, profitability, conversion, certificates } = data;
  const custMax = Math.max(...customers.growthByMonth.map((m) => m.count), 1);
  const certMax = Math.max(...certificates.byMonth.map((m) => m.count), 1);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <span className="text-[11px] font-medium tracking-[0.12em] text-secondary uppercase">管理KPI</span>
        <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">経営ダッシュボード</h1>
        <p className="text-[14px] text-secondary leading-relaxed">
          キャッシュフロー・収益性・顧客指標など経営に重要なKPIを一覧表示
        </p>
      </div>

      {/* ═══ Section 1: Cash Flow ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">CASH FLOW / キャッシュフロー</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-4 space-y-1 relative overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: cashFlow.operatingCF >= 0 ? "var(--accent-emerald)" : "var(--accent-red)" }}
            />
            <div className="pl-2">
              <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">営業CF（累計）</div>
              <div
                className="text-xl font-bold"
                style={{ color: cashFlow.operatingCF >= 0 ? "var(--accent-emerald)" : "var(--accent-red)" }}
              >
                {formatJpy(cashFlow.operatingCF)}
              </div>
              <div className="text-[11px] text-muted">入金 - 支出</div>
            </div>
          </div>

          <div className="glass-card p-4 space-y-1">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">今月のCF</div>
            <div
              className="text-xl font-bold"
              style={{ color: cashFlow.thisMonth.cf >= 0 ? "var(--accent-emerald)" : "var(--accent-red)" }}
            >
              {formatJpy(cashFlow.thisMonth.cf)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">前月比</span>
              <GrowthBadge rate={cashFlow.cfGrowthRate} />
            </div>
          </div>

          <KPICard
            tag="累計入金額"
            value={formatJpy(cashFlow.totalCashIn)}
            sub="Cash In"
            color="var(--accent-emerald)"
          />
          <KPICard tag="累計支出" value={formatJpy(cashFlow.totalCashOut)} sub="Cash Out" color="var(--accent-amber)" />
        </div>

        {/* CF Detail */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="glass-card p-4 space-y-1">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">売掛金（AR）</div>
            <div className="text-lg font-bold text-warning-text">{formatJpy(cashFlow.accountsReceivable)}</div>
            <div className="text-[11px] text-muted">未回収の請求額</div>
          </div>
          <div className="glass-card p-4 space-y-1">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">入金予定（2ヶ月内）</div>
            <div className="text-lg font-bold text-accent">{formatJpy(cashFlow.upcomingAR)}</div>
            <div className="text-[11px] text-muted">支払期限内のAR</div>
          </div>
          <div className="glass-card p-4 space-y-2">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">今月 vs 先月</div>
            <div className="flex justify-between text-[12px]">
              <span className="text-muted">今月入金</span>
              <span className="font-semibold text-primary">{formatJpy(cashFlow.thisMonth.cashIn)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-muted">先月入金</span>
              <span className="font-semibold text-primary">{formatJpy(cashFlow.lastMonth.cashIn)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-muted">今月支出</span>
              <span className="font-semibold text-warning-text">{formatJpy(cashFlow.thisMonth.cashOut)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Section 2: Profitability ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">PROFITABILITY / 収益性</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard tag="売上高（累計）" value={formatJpy(profitability.totalRevenue)} sub="Total Revenue" />
          <KPICard
            tag="仕入原価"
            value={formatJpy(profitability.totalPurchases)}
            sub="Cost of Goods"
            color="var(--accent-amber)"
          />
          <KPICard
            tag="粗利益"
            value={formatJpy(profitability.grossProfit)}
            sub="Gross Profit"
            color="var(--accent-emerald)"
          />

          <div className="glass-card p-4 flex items-center gap-4">
            <ProgressRing rate={profitability.grossMarginRate} color="var(--accent-emerald)" />
            <div>
              <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">粗利率</div>
              <div className="text-[12px] text-muted mt-0.5">Gross Margin</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Section 3: Collection / 回収 ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">COLLECTION / 債権回収</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-4 flex items-center gap-4">
            <ProgressRing
              rate={collection.collectionRate}
              color={
                collection.collectionRate !== null && collection.collectionRate >= 80
                  ? "var(--accent-emerald)"
                  : "var(--accent-amber)"
              }
            />
            <div>
              <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">回収率</div>
              <div className="text-[12px] text-muted mt-0.5">Collection Rate</div>
            </div>
          </div>

          <KPICard
            tag="DSO（売掛回転日数）"
            value={collection.dso !== null ? `${collection.dso}日` : "-"}
            sub="Days Sales Outstanding"
            color={collection.dso !== null && collection.dso > 60 ? "var(--accent-red)" : undefined}
          />

          <KPICard
            tag="期限超過"
            value={collection.overdueCount > 0 ? `${collection.overdueCount}件` : "0件"}
            sub={collection.overdueAmount > 0 ? formatJpy(collection.overdueAmount) : "超過なし"}
            danger={collection.overdueCount > 0}
          />

          <div className="glass-card p-4 space-y-2">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">請求 vs 入金</div>
            <div className="space-y-1.5">
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-muted">請求額</span>
                  <span className="font-medium text-primary">{formatJpy(collection.totalInvoiced)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: "100%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-muted">入金済</span>
                  <span className="font-medium text-success-text">{formatJpy(collection.totalPaid)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{
                      width: `${collection.totalInvoiced > 0 ? (collection.totalPaid / collection.totalInvoiced) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Section 4: Customer Metrics ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">CUSTOMER METRICS / 顧客指標</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            tag="顧客数"
            value={String(customers.total)}
            sub={`取引顧客 ${customers.activeCustomers}社`}
            color="var(--accent-blue)"
          />
          <KPICard
            tag="顧客単価（ARPU）"
            value={customers.arpu !== null ? formatJpy(customers.arpu) : "-"}
            sub="Avg Revenue Per Customer"
          />
          <KPICard
            tag="LTV（顧客生涯価値）"
            value={customers.ltv !== null ? formatJpy(customers.ltv) : "-"}
            sub={customers.avgLifeMonths > 0 ? `平均${customers.avgLifeMonths}ヶ月` : ""}
          />
          <div className="glass-card p-4 space-y-2">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">顧客数推移</div>
            <MiniBar
              data={customers.growthByMonth.slice(-6).map((m) => ({ label: m.label, value: m.count }))}
              maxVal={custMax}
              color="var(--accent-blue)"
            />
          </div>
        </div>
      </section>

      {/* ═══ Section 5: Conversion ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">CONVERSION / 商談転換</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="glass-card p-4 flex items-center gap-4">
            <ProgressRing rate={conversion.conversionRate} color="var(--accent-violet)" />
            <div>
              <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">見積→受注 転換率</div>
              <div className="text-[12px] text-muted mt-0.5">
                {conversion.convertedEstimates} / {conversion.totalEstimates} 件
              </div>
            </div>
          </div>

          <KPICard
            tag="見積書（総数）"
            value={`${conversion.totalEstimates}件`}
            sub="Total Estimates"
            color="var(--accent-violet)"
          />
          <KPICard
            tag="受注件数"
            value={`${conversion.convertedEstimates}件`}
            sub="Converted"
            color="var(--accent-emerald)"
          />
        </div>
      </section>

      {/* ═══ Section 6: Certificates ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">CERTIFICATES / 施工証明書</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            tag="発行総数"
            value={String(certificates.total)}
            sub={`有効 ${certificates.active}件`}
            color="var(--accent-blue)"
          />
          <KPICard
            tag="平均施工単価"
            value={certificates.avgServicePrice !== null ? formatJpy(certificates.avgServicePrice) : "-"}
            sub="Avg Service Price"
          />
          <div className="glass-card p-4 space-y-2 sm:col-span-2">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">月別発行数</div>
            <MiniBar
              data={certificates.byMonth.slice(-6).map((m) => ({ label: m.label, value: m.count }))}
              maxVal={certMax}
              color="var(--accent-violet)"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
