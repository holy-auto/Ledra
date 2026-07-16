"use client";

/**
 * 店舗利用状況ダッシュボード (運営専用)。
 * /api/admin/platform/store-usage から店舗別の月間利用・累計・機能別利用率を取得して表示する。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatDateTime } from "@/lib/format";

type StoreRow = {
  tenant_id: string;
  tenant_name: string | null;
  plan_tier: string;
  is_active: boolean;
  operations: number;
  reservations: number;
  invoices: number;
  active_members: number;
  last_login_at: string | null;
};

type FeatureAdoption = {
  key: string;
  label: string;
  tenants_using: number;
  adoption_rate: number | null;
};

type UsageData = {
  ok: boolean;
  month: string;
  store_count: number;
  active_store_count: number;
  cumulative: { reservations: number; work_records: number; invoices: number };
  stores: StoreRow[];
  feature_adoption: FeatureAdoption[];
  truncated: boolean;
};

const PLAN_LABELS: Record<string, string> = {
  free: "フリー",
  starter: "スターター",
  standard: "スタンダード",
  pro: "プロ",
  enterprise: "エンタープライズ",
};

/** YYYY-MM を 1 ヶ月ずらす。 */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthJst(): string {
  const jst = new Date(Date.now() + 9 * 3_600_000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export default function StoreUsageClient() {
  const [month, setMonth] = useState<string>(currentMonthJst());
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const thisMonth = useMemo(() => currentMonthJst(), []);
  const atCurrentMonth = month >= thisMonth;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/platform/store-usage?month=${month}`, { cache: "no-store" });
      const json = await parseJsonSafe<UsageData>(res);
      if (!res.ok || !json?.ok) {
        setError((json as { error?: string } | null)?.error ?? `取得に失敗しました (HTTP ${res.status})`);
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("通信エラーが発生しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* 月セレクタ */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ← 前月
          </button>
          <span className="min-w-[120px] text-center text-base font-semibold text-primary">{fmtMonthLabel(month)}</span>
          <button
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={atCurrentMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            翌月 →
          </button>
          {!atCurrentMonth && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setMonth(thisMonth)}>
              今月へ
            </button>
          )}
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary px-3 py-1.5 text-xs">
          {loading ? "更新中…" : "更新"}
        </button>
      </div>

      {error && (
        <div className="glass-card p-6 text-center space-y-3">
          <div className="font-semibold text-danger">エラーが発生しました</div>
          <div className="text-sm text-muted">{error}</div>
          <button onClick={load} className="btn-primary">
            再試行
          </button>
        </div>
      )}

      {loading && !data && <LoadingSkeleton />}

      {data && (
        <>
          {data.truncated && (
            <div className="glass-card border-l-4 border-warning p-4 text-xs text-muted">
              データ件数が集計上限を超えたため、当月の一部指標が過小に表示されている可能性があります。
            </div>
          )}

          {/* 累計カード */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="店舗数" value={data.store_count} sub={`アクティブ: ${data.active_store_count}`} />
            <StatCard label="予約 累計" value={data.cumulative.reservations} sub="全期間・全店舗" color="text-accent" />
            <StatCard
              label="作業記録 累計"
              value={data.cumulative.work_records}
              sub="全期間・全店舗"
              color="text-success"
            />
            <StatCard
              label="請求 累計"
              value={data.cumulative.invoices}
              sub="全期間・全店舗"
              color="text-violet-text"
            />
            <StatCard
              label="当月 操作回数"
              value={data.stores.reduce((s, r) => s + r.operations, 0)}
              sub={fmtMonthLabel(data.month)}
            />
          </section>

          {/* 機能別利用率 */}
          <section className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">機能別利用率</div>
            <div className="text-base font-semibold text-primary mb-1">当月に各機能を使った店舗の割合</div>
            <div className="text-[11px] text-muted mb-4">
              分母 = アクティブ店舗 {data.active_store_count} 店舗 / {fmtMonthLabel(data.month)}
            </div>
            {data.feature_adoption.length === 0 ? (
              <div className="text-sm text-muted">データがありません。</div>
            ) : (
              <div className="space-y-3">
                {data.feature_adoption.map((f) => {
                  const w = f.adoption_rate === null ? 0 : Math.round(f.adoption_rate * 100);
                  return (
                    <div key={f.key}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-secondary">{f.label}</span>
                        <span className="text-sm font-semibold text-primary">
                          {pct(f.adoption_rate)}
                          <span className="ml-2 text-[11px] font-normal text-muted">{f.tenants_using} 店舗</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-active">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 店舗別 月間利用 */}
          <section className="glass-card">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">店舗別 月間利用状況</div>
              <div className="mt-1 text-base font-semibold text-primary">{fmtMonthLabel(data.month)}</div>
            </div>
            {data.stores.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">店舗がありません。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-hover">
                      <Th>店舗</Th>
                      <Th>プラン</Th>
                      <Th align="right">操作回数</Th>
                      <Th align="right">予約</Th>
                      <Th align="right">請求</Th>
                      <Th align="right">アクティブ会員</Th>
                      <Th>最終ログイン</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.stores.map((s) => (
                      <tr key={s.tenant_id} className="hover:bg-surface-hover transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-primary">
                            {s.tenant_name ?? s.tenant_id.slice(0, 8)}
                            {!s.is_active && <span className="ml-2 text-[10px] text-danger">停止中</span>}
                          </div>
                          <div className="font-mono text-[11px] text-muted">{s.tenant_id.slice(0, 12)}…</div>
                        </td>
                        <td className="px-4 py-3 text-secondary">{PLAN_LABELS[s.plan_tier] ?? s.plan_tier}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                          {s.operations.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{s.reservations.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono">{s.invoices.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono">{s.active_members.toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {s.last_login_at ? formatDateTime(s.last_login_at) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-border-subtle p-4 text-[11px] text-muted">
              ※ 「アクティブ会員」は当月に最終ログインした会員数です。ログイン回数そのものは記録していないため、
              過去月は実際より少なく表示される場合があります (最新ログインのみ保持)。
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-muted ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function StatCard({
  label,
  value,
  sub,
  color = "text-primary",
}: {
  label: string;
  value: number | string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${color}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-xs text-muted">{sub}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="glass-card p-5 space-y-2 animate-pulse">
            <div className="h-3 w-16 rounded bg-surface-hover" />
            <div className="h-8 w-20 rounded bg-surface-hover" />
            <div className="h-3 w-24 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
      <div className="glass-card p-5 animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-surface-hover" />
        <div className="h-20 w-full rounded bg-surface-hover" />
      </div>
    </div>
  );
}
