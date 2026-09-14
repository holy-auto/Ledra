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

/** 売上目標 (sales_targets) — 各指標は未設定 (null) を許容。 */
type SalesTarget = {
  target_revenue: number | null;
  target_jobs: number | null;
  target_new_customers: number | null;
};

/** 担当者別 月次実績 (staff-performance API)。 */
type StaffRow = {
  user_id: string;
  display_name: string;
  completed_jobs: number;
  estimated_revenue: number;
  month: string;
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

/** 達成率を 0〜100 に丸める (表示用ラベルは丸めない実値を別途渡す)。 */
function pctOf(actual: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return (actual / target) * 100;
}

/** 目標 vs 実績の横棒。達成率に応じて色を変える (>=100% emerald / >=60% blue / それ未満 amber)。 */
function TargetProgressRow({
  label,
  actualText,
  targetText,
  rate,
}: {
  label: string;
  actualText: string;
  targetText: string;
  rate: number | null;
}) {
  const clamped = rate === null ? 0 : Math.min(Math.max(rate, 0), 100);
  const color =
    rate === null
      ? "var(--accent-blue)"
      : rate >= 100
        ? "var(--accent-emerald)"
        : rate >= 60
          ? "var(--accent-blue)"
          : "var(--accent-amber)";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</span>
        <span className="text-[12px] text-secondary">
          <span className="font-semibold text-primary">{actualText}</span>
          <span className="mx-1 text-muted">/</span>
          <span>{targetText}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        </div>
        <span className="w-10 text-right text-[12px] font-bold" style={{ color }}>
          {rate !== null ? `${Math.round(rate)}%` : "-"}
        </span>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function ManagementClient() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 売上目標 / PDCA
  const [target, setTarget] = useState<SalesTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState<SalesTarget>({
    target_revenue: null,
    target_jobs: null,
    target_new_customers: null,
  });
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetErr, setTargetErr] = useState<string | null>(null);

  // 担当者別実績
  const [staff, setStaff] = useState<StaffRow[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [kpiRes, targetRes, staffRes] = await Promise.all([
          fetch("/api/admin/management-kpi", { cache: "no-store" }),
          fetch("/api/admin/sales-targets", { cache: "no-store" }),
          fetch("/api/admin/staff-performance", { cache: "no-store" }),
        ]);

        const kpiJson = await parseJsonSafe<KPIData & { error?: string; message?: string }>(kpiRes);
        if (!kpiRes.ok) throw new Error(kpiJson?.message ?? kpiJson?.error ?? `HTTP ${kpiRes.status}`);
        setData(kpiJson);

        // 目標・担当者実績は副次データ。失敗してもダッシュボード本体は描画する。
        if (targetRes.ok) {
          const tj = await parseJsonSafe<{ target: SalesTarget | null }>(targetRes);
          setTarget(tj?.target ?? null);
        }
        if (staffRes.ok) {
          const sj = await parseJsonSafe<{ staff: StaffRow[] }>(staffRes);
          setStaff(sj?.staff ?? []);
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      }
      setLoading(false);
    })();
  }, []);

  /** 編集モードへ。現在の目標値を draft にコピー。 */
  function startEditTarget() {
    setTargetDraft({
      target_revenue: target?.target_revenue ?? null,
      target_jobs: target?.target_jobs ?? null,
      target_new_customers: target?.target_new_customers ?? null,
    });
    setTargetErr(null);
    setEditingTarget(true);
  }

  /** 目標値を PUT で upsert。成功したら表示モードへ戻す。 */
  async function saveTarget() {
    setSavingTarget(true);
    setTargetErr(null);
    try {
      const now = new Date();
      const res = await fetch("/api/admin/sales-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          target_revenue: targetDraft.target_revenue,
          target_jobs: targetDraft.target_jobs,
          target_new_customers: targetDraft.target_new_customers,
        }),
      });
      const j = await parseJsonSafe<{ target?: SalesTarget; error?: string; message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setTarget(j?.target ?? { ...targetDraft });
      setEditingTarget(false);
    } catch (e: unknown) {
      setTargetErr(e instanceof Error ? e.message : String(e));
    }
    setSavingTarget(false);
  }

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

  // ─── PDCA 用の当月実績 ───
  // 当月の完了案件 (staff-performance API: status='completed' の月次集計) から
  // 受注件数・売上の実績を導出。新規顧客は当月の顧客増加数 (growthByMonth 末尾)。
  const thisMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const staffRows = staff ?? [];
  const actualRevenue = staffRows.reduce((s, r) => s + r.estimated_revenue, 0);
  const actualJobs = staffRows.reduce((s, r) => s + r.completed_jobs, 0);
  const thisMonthGrowth = customers.growthByMonth.find((m) => m.month === thisMonthKey);
  const actualNewCustomers = thisMonthGrowth?.count ?? 0;
  const hasTarget =
    !!target && (target.target_revenue !== null || target.target_jobs !== null || target.target_new_customers !== null);

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

      {/* ═══ Section 0: PDCA / 今月の目標 ═══ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">PDCA / 今月の目標</h2>
          {hasTarget && !editingTarget && (
            <button
              type="button"
              onClick={startEditTarget}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-secondary hover:text-primary transition-colors"
              aria-label="目標を編集"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                />
              </svg>
              編集
            </button>
          )}
        </div>

        <div className="glass-card p-5 space-y-4">
          {!hasTarget && !editingTarget ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-[13px] text-muted">今月の目標がまだ設定されていません。</p>
              <button
                type="button"
                onClick={startEditTarget}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                目標を設定する
              </button>
            </div>
          ) : editingTarget ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    売上目標 (円)
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={targetDraft.target_revenue ?? ""}
                    onChange={(e) =>
                      setTargetDraft((d) => ({
                        ...d,
                        target_revenue: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      }))
                    }
                    placeholder="例: 1200000"
                    className="w-full rounded-lg border border-default bg-surface px-3 py-2 text-[14px] text-primary outline-none focus:border-accent"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">受注件数目標</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={targetDraft.target_jobs ?? ""}
                    onChange={(e) =>
                      setTargetDraft((d) => ({
                        ...d,
                        target_jobs: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      }))
                    }
                    placeholder="例: 20"
                    className="w-full rounded-lg border border-default bg-surface px-3 py-2 text-[14px] text-primary outline-none focus:border-accent"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">新規顧客目標</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={targetDraft.target_new_customers ?? ""}
                    onChange={(e) =>
                      setTargetDraft((d) => ({
                        ...d,
                        target_new_customers: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      }))
                    }
                    placeholder="例: 5"
                    className="w-full rounded-lg border border-default bg-surface px-3 py-2 text-[14px] text-primary outline-none focus:border-accent"
                  />
                </label>
              </div>
              {targetErr && <p className="text-[12px] text-danger">{targetErr}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveTarget}
                  disabled={savingTarget}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {savingTarget ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTarget(false);
                    setTargetErr(null);
                  }}
                  disabled={savingTarget}
                  className="rounded-lg border border-default px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:text-primary disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <TargetProgressRow
                label="売上目標"
                actualText={formatJpy(actualRevenue)}
                targetText={target?.target_revenue != null ? formatJpy(target.target_revenue) : "未設定"}
                rate={pctOf(actualRevenue, target?.target_revenue ?? null)}
              />
              <TargetProgressRow
                label="受注件数目標"
                actualText={`${actualJobs}件`}
                targetText={target?.target_jobs != null ? `${target.target_jobs}件` : "未設定"}
                rate={pctOf(actualJobs, target?.target_jobs ?? null)}
              />
              <TargetProgressRow
                label="新規顧客目標"
                actualText={`${actualNewCustomers}名`}
                targetText={target?.target_new_customers != null ? `${target.target_new_customers}名` : "未設定"}
                rate={pctOf(actualNewCustomers, target?.target_new_customers ?? null)}
              />
              <p className="pt-1 text-[10px] text-muted">
                実績は当月の完了案件 (受注件数・売上) と顧客増加数から算出しています。
              </p>
            </div>
          )}
        </div>
      </section>

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

          <div className="glass-card p-4 space-y-3 sm:col-span-2">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">収益構造内訳</div>
            <div className="space-y-2">
              {/* 売上・原価・粗利の3段積み */}
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">売上高</span>
                <span className="font-medium text-primary">{formatJpy(profitability.totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">仕入原価</span>
                <span className="font-medium text-warning-text">{formatJpy(profitability.totalPurchases)}</span>
              </div>
              <div className="h-px bg-border-default my-1" />
              <div className="flex justify-between text-[12px] font-semibold">
                <span className="text-primary">粗利益</span>
                <span style={{ color: "var(--accent-emerald)" }}>{formatJpy(profitability.grossProfit)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(Math.max(profitability.grossMarginRate ?? 0, 0), 100)}%`,
                    backgroundColor: "var(--accent-emerald)",
                  }}
                />
              </div>
              <div className="text-right text-[11px] text-muted">
                粗利率 {profitability.grossMarginRate?.toFixed(1) ?? "-"}%
              </div>
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

      {/* ═══ Section 4.5: Staff Performance / 担当者別実績 ═══ */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">STAFF PERFORMANCE / 担当者別実績</h2>

        <div className="glass-card p-4">
          {staffRows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">担当者が割り当てられた案件がありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-default text-left">
                    <th className="pb-2 pr-3 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
                      担当者名
                    </th>
                    <th className="pb-2 px-3 text-right text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
                      完了件数
                    </th>
                    <th className="pb-2 pl-3 text-right text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
                      売上貢献
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((s) => (
                    <tr key={s.user_id} className="border-b border-default/50 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-primary">{s.display_name}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-secondary">{s.completed_jobs}件</td>
                      <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-primary">
                        {formatJpy(s.estimated_revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
