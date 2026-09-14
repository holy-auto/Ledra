"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";

type Stage = {
  id: string;
  label: string;
  count: number;
  drop_pct: number;
};

type FunnelData = {
  range_days: number;
  total: number;
  stages: Stage[];
};

const RANGES = [7, 30, 90] as const;

/**
 * オンボーディング・ファネル可視化セクション。
 *
 * 直近 N 日のサインアップに対し、各オンボーディング段階の到達数を
 * 横棒グラフ + ドロップオフ率で表示。運営側がどこで離脱が発生しているかを
 * 一目で把握できる。
 */
export default function OnboardingFunnelSection() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const {
    data,
    error: swrError,
    isLoading: loading,
  } = useSWR<FunnelData>(`/api/admin/platform/onboarding-funnel?range=${range}`, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const err = swrError ? (swrError instanceof Error ? swrError.message : String(swrError)) : null;

  return (
    <section className="glass-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">ONBOARDING FUNNEL</div>
          <div className="mt-1 text-base font-semibold text-primary">オンボーディング ファネル</div>
          <p className="mt-1 text-xs text-muted">
            直近 {range} 日のサインアップから各オンボーディング段階への到達状況。離脱が大きい段階に介入余地があります。
          </p>
        </div>
        <div className="flex rounded-lg border border-border-default overflow-hidden text-xs">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 transition-colors ${
                range === r ? "bg-accent text-white" : "bg-surface text-secondary hover:bg-surface-hover"
              }`}
            >
              {r}日
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-sm text-muted py-4">読み込み中…</div>}
      {err && <div className="text-sm text-danger py-2">{err}</div>}

      {data && !loading && (
        <>
          {data.total === 0 ? (
            <div className="text-sm text-muted py-4">この期間のサインアップはありません。</div>
          ) : (
            <div className="space-y-2">
              {data.stages.map((s, idx) => {
                const pctOfTotal = data.total > 0 ? Math.round((s.count / data.total) * 100) : 0;
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-12 gap-2 items-center py-1.5 border-b border-border-subtle last:border-0"
                  >
                    <div className="col-span-12 sm:col-span-3 text-xs text-secondary truncate">
                      <span className="text-muted mr-1.5">{idx + 1}.</span>
                      {s.label}
                    </div>
                    <div className="col-span-8 sm:col-span-7">
                      <div className="h-5 rounded-full bg-surface-active overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            idx === 0
                              ? "bg-accent"
                              : s.drop_pct > 50
                                ? "bg-danger"
                                : s.drop_pct > 30
                                  ? "bg-warning"
                                  : "bg-gradient-to-r from-accent to-violet-500"
                          }`}
                          style={{ width: `${pctOfTotal}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-right">
                      <span className="text-sm font-semibold text-primary">{s.count}</span>
                      <span className="text-[11px] text-muted ml-1">({pctOfTotal}%)</span>
                      {s.drop_pct > 0 && <div className="text-[10px] text-muted">▼ {s.drop_pct}% drop</div>}
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 pt-3 border-t border-border-default text-[11px] text-muted leading-relaxed">
                <strong className="text-primary">読み方:</strong>{" "}
                各バーは「サインアップ全体に対する各段階の到達率」を示します。 右側の <strong>drop %</strong>{" "}
                は直前段階からの離脱率。30% 超で警告色、50% 超で危険色になります。
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
