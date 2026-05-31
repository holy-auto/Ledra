"use client";

/**
 * 運営ダッシュボードの AI 利用状況セクション。
 *
 * - 期間切替 (7 / 30 / 90 日)
 * - サマリ KPI: 総コール数 / 成功率 / 平均レイテンシ / トークン合計
 * - エンドポイント別 stacked bar
 * - 日次推移
 * - 信頼度ヒストグラム
 * - outcome 別件数
 *
 * テーブル未マイグレーション環境 (warning フラグ) では 0 表示 + 警告 1 行で
 * UI を壊さずに済む。
 */
import { useEffect, useMemo, useState } from "react";

type Days = 7 | 30 | 90;

interface ByEndpoint {
  endpoint: string;
  count: number;
  avgConfidence: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostJpy?: number;
}

interface Stats {
  byOutcome: Record<string, number>;
  byEndpoint: ByEndpoint[];
  dailySeries: Array<{ date: string; count: number }>;
  confidenceHistogram: number[];
  totalCount: number;
  okCount: number;
  errorCount: number;
  latencyP50: number | null;
  latencyP95: number | null;
  estimatedCostJpy?: number;
  usdJpyRate?: number;
}

const OUTCOME_LABEL: Record<string, string> = {
  ok: "成功",
  ai_disabled: "AI 設定 OFF",
  plan_limit: "プラン制限",
  rate_limit: "レート制限",
  schema_error: "入力不正",
  error: "エラー",
};

const OUTCOME_TONE: Record<string, string> = {
  ok: "bg-success-dim text-success-text",
  ai_disabled: "bg-slate-100 text-slate-700",
  plan_limit: "bg-amber-100 text-amber-900",
  rate_limit: "bg-amber-100 text-amber-900",
  schema_error: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
};

export default function AiUsageDashboard() {
  const [days, setDays] = useState<Days>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/admin/platform/ai-usage?days=${days}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !j?.ok) {
          setErr(j?.message ?? "取得に失敗しました");
          return;
        }
        setStats(j.stats ?? null);
        setWarning(j.warning ?? null);
      } catch {
        if (!cancelled) setErr("通信エラー");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const successRate = useMemo(() => {
    if (!stats || stats.totalCount === 0) return null;
    return Math.round((stats.okCount / stats.totalCount) * 1000) / 10;
  }, [stats]);

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">AI USAGE</div>
          <div className="mt-1 text-base font-semibold text-primary">AI 利用状況</div>
          <p className="mt-1 text-xs text-muted">
            16 ルートのコール数 / 成功率 / 信頼度 / トークン消費 / 概算コストを集計。
            {stats?.usdJpyRate != null && <>（コストは概算・@¥{stats.usdJpyRate}/$）</>}
          </p>
        </div>
        <div className="flex gap-1.5">
          {([7, 30, 90] as Days[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`text-xs px-2.5 py-1 rounded-full border ${
                days === d ? "border-accent bg-accent/10 text-accent" : "border-border-default bg-surface text-muted"
              }`}
              onClick={() => setDays(d)}
            >
              {d}日
            </button>
          ))}
        </div>
      </div>

      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠ {warning}
        </div>
      )}
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{err}</div>}

      {loading && !stats && (
        <div className="rounded-lg border border-border-default bg-surface px-3 py-3 text-xs text-muted">
          読み込み中…
        </div>
      )}

      {stats && (
        <>
          {/* KPI */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="概算コスト" value={`¥${Math.round(stats.estimatedCostJpy ?? 0).toLocaleString("ja-JP")}`} />
            <Kpi label="総コール" value={stats.totalCount.toLocaleString("ja-JP")} />
            <Kpi label="成功率" value={successRate != null ? `${successRate}%` : "—"} />
            <Kpi
              label="レイテンシ (P50/P95)"
              value={
                stats.latencyP50 != null && stats.latencyP95 != null
                  ? `${stats.latencyP50}ms / ${stats.latencyP95}ms`
                  : "—"
              }
            />
            <Kpi
              label="トークン消費"
              value={`${stats.byEndpoint
                .reduce((s, e) => s + e.totalInputTokens + e.totalOutputTokens, 0)
                .toLocaleString("ja-JP")}`}
            />
          </div>

          {/* outcome 別 */}
          {Object.keys(stats.byOutcome).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5">Outcome 別件数</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.byOutcome).map(([oc, n]) => (
                  <span
                    key={oc}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      OUTCOME_TONE[oc] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {OUTCOME_LABEL[oc] ?? oc}: {n.toLocaleString("ja-JP")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* エンドポイント別 */}
          {stats.byEndpoint.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5">エンドポイント別</div>
              <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-surface-hover text-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Endpoint</th>
                      <th className="text-right px-3 py-2 font-semibold">コール</th>
                      <th className="text-right px-3 py-2 font-semibold">平均信頼度</th>
                      <th className="text-right px-3 py-2 font-semibold">入力 tok</th>
                      <th className="text-right px-3 py-2 font-semibold">出力 tok</th>
                      <th className="text-right px-3 py-2 font-semibold">概算 ¥</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byEndpoint.map((e) => (
                      <tr key={e.endpoint} className="border-t border-border-subtle">
                        <td className="px-3 py-2 font-mono text-[10px] text-primary">{e.endpoint}</td>
                        <td className="text-right px-3 py-2 text-secondary">{e.count.toLocaleString("ja-JP")}</td>
                        <td className="text-right px-3 py-2 text-secondary">
                          {e.avgConfidence != null ? Math.round(e.avgConfidence * 100) + "%" : "—"}
                        </td>
                        <td className="text-right px-3 py-2 text-secondary">
                          {e.totalInputTokens.toLocaleString("ja-JP")}
                        </td>
                        <td className="text-right px-3 py-2 text-secondary">
                          {e.totalOutputTokens.toLocaleString("ja-JP")}
                        </td>
                        <td className="text-right px-3 py-2 text-secondary">
                          ¥{Math.round(e.estimatedCostJpy ?? 0).toLocaleString("ja-JP")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* daily チャート */}
          {stats.dailySeries.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5">日次推移</div>
              <DailyBars series={stats.dailySeries} />
            </div>
          )}

          {/* 信頼度ヒストグラム */}
          {stats.confidenceHistogram.some((n) => n > 0) && (
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5">信頼度ヒストグラム</div>
              <ConfidenceHist hist={stats.confidenceHistogram} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface px-3 py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-primary">{value}</div>
    </div>
  );
}

function DailyBars({ series }: { series: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div className="flex items-end gap-0.5 h-20 overflow-x-auto">
      {series.map((s) => {
        const h = Math.round((s.count / max) * 100);
        return (
          <div key={s.date} title={`${s.date}: ${s.count}`} className="flex-1 min-w-[6px]">
            <div className="bg-accent/70 rounded-t" style={{ height: `${h}%`, minHeight: s.count > 0 ? 2 : 0 }} />
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceHist({ hist }: { hist: number[] }) {
  const max = Math.max(1, ...hist);
  return (
    <div className="flex items-end gap-1 h-20">
      {hist.map((n, i) => {
        const h = Math.round((n / max) * 100);
        const label = `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${label}: ${n}`}>
            <div className="flex-1 w-full flex items-end">
              <div className="w-full bg-accent/70 rounded-t" style={{ height: `${h}%`, minHeight: n > 0 ? 2 : 0 }} />
            </div>
            <div className="text-[9px] text-muted">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
