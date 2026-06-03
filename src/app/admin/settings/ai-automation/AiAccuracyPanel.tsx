"use client";

import { useEffect, useState } from "react";

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
  confidenceHistogram: number[];
  totalCount: number;
  okCount: number;
  errorCount: number;
  latencyP50: number | null;
  latencyP95: number | null;
  estimatedCostJpy?: number;
}


export default function AiAccuracyPanel() {
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
          setErr(j?.message ?? "データの取得に失敗しました");
          return;
        }
        if (j.warning) setWarning(j.warning);
        setStats(j.stats);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const successRate =
    stats && stats.totalCount > 0 ? Math.round((stats.okCount / stats.totalCount) * 100) : null;

  const totalConf = stats ? stats.confidenceHistogram.reduce((s, v) => s + v, 0) : 0;
  const avgConfBin =
    totalConf > 0
      ? stats!.confidenceHistogram.reduce((s, v, i) => s + v * (i * 10 + 5), 0) / totalConf
      : null;

  const maxHistVal = stats ? Math.max(...stats.confidenceHistogram, 1) : 1;

  return (
    <div className="glass-card">
      <div className="p-5 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">AI 利用状況</div>
            <div className="mt-1 text-base font-semibold text-primary">AI 精度レポート</div>
          </div>
          <div className="flex gap-1">
            {([7, 30, 90] as Days[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  days === d
                    ? "bg-accent text-white font-semibold"
                    : "bg-surface-active text-muted hover:text-primary"
                }`}
              >
                {d}日
              </button>
            ))}
          </div>
        </div>
      </div>

      {warning && (
        <div className="px-5 py-2 bg-warning/10 border-b border-border-subtle">
          <p className="text-xs text-warning-text">{warning}</p>
        </div>
      )}

      {loading && !stats && (
        <div className="p-6 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-surface-active animate-pulse" />
          ))}
        </div>
      )}

      {err && !stats && (
        <div className="p-6 text-sm text-danger text-center">{err}</div>
      )}

      {stats && (
        <div className="p-5 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="AI 呼び出し" value={stats.totalCount.toLocaleString("ja-JP")} unit="回" />
            <KpiCard
              label="成功率"
              value={successRate !== null ? `${successRate}` : "—"}
              unit="%"
              tone={successRate !== null && successRate >= 90 ? "text-success" : successRate !== null && successRate >= 70 ? "text-warning" : "text-danger"}
            />
            <KpiCard
              label="平均信頼度"
              value={avgConfBin !== null ? `${Math.round(avgConfBin)}` : "—"}
              unit="%"
            />
            <KpiCard
              label="概算コスト"
              value={
                stats.estimatedCostJpy !== undefined
                  ? `¥${Math.round(stats.estimatedCostJpy).toLocaleString("ja-JP")}`
                  : "—"
              }
              unit=""
            />
          </div>

          {/* Confidence histogram */}
          <div>
            <div className="text-xs font-semibold text-muted mb-2">信頼度分布</div>
            <div className="flex items-end gap-1 h-14">
              {stats.confidenceHistogram.map((count, i) => {
                const pct = Math.round((count / maxHistVal) * 100);
                const isHigh = i >= 7;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-t transition-all ${isHigh ? "bg-success/70" : i >= 4 ? "bg-accent/60" : "bg-border-default"}`}
                      style={{ height: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                    />
                    <span className="text-[9px] text-muted hidden sm:block">{i * 10}%</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted">低信頼度</span>
              <span className="text-[10px] text-muted">高信頼度</span>
            </div>
          </div>

          {/* Top endpoints */}
          {stats.byEndpoint.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted mb-2">機能別呼び出し数 (上位5件)</div>
              <div className="space-y-1.5">
                {stats.byEndpoint.slice(0, 5).map((ep) => {
                  const name = ep.endpoint.split("/").pop() ?? ep.endpoint;
                  const maxCount = stats.byEndpoint[0].count;
                  const barPct = Math.round((ep.count / maxCount) * 100);
                  return (
                    <div key={ep.endpoint}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-secondary truncate max-w-[200px]">{name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>{ep.count}回</span>
                          {ep.avgConfidence !== null && (
                            <span className="text-accent">信頼度 {Math.round(ep.avgConfidence * 100)}%</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-active overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  tone = "text-primary",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: string;
}) {
  return (
    <div className="glass-card p-3 space-y-0.5">
      <div className="text-[10px] font-semibold tracking-widest text-muted uppercase">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>
        {value}
        {unit && <span className="text-sm font-normal text-muted ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
