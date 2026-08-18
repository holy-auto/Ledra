"use client";

import { useCallback, useEffect, useState } from "react";

interface TypeSummary {
  type: string;
  label: string;
  sent: number;
  failed: number;
  total: number;
  failure_rate: number;
  line: number;
  email: number;
}
interface Summary {
  by_type: TypeSummary[];
  totals: { sent: number; failed: number; total: number; failure_rate: number };
  silent_types: string[];
}
interface RecentFailure {
  type: string;
  channel: string | null;
  sent_at: string | null;
  recipient: string | null;
}

const DAY_OPTIONS = [7, 30, 90] as const;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function fmt(ts: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

export default function NotificationLogsClient() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failures, setFailures] = useState<RecentFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/notification-logs/summary?days=${d}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSummary(j.summary ?? null);
      setFailures(Array.isArray(j.recent_failures) ? j.recent_failures : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">通知配信状況</h1>
          <p className="mt-1 text-sm text-secondary">
            リマインド・通知が実際に届いているか（送信 / 失敗 / 未配信）を確認できます。
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border-default p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                days === d ? "bg-accent text-white" : "text-secondary hover:text-primary"
              }`}
            >
              {d}日
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : err ? (
        <div className="glass-card rounded-xl p-6 text-sm text-danger">{err}</div>
      ) : summary ? (
        <div className="space-y-6">
          {/* サマリー */}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="送信成功" value={summary.totals.sent} tone="success" />
            <StatCard
              label="失敗"
              value={summary.totals.failed}
              tone={summary.totals.failed > 0 ? "danger" : "muted"}
            />
            <StatCard
              label="失敗率"
              value={pct(summary.totals.failure_rate)}
              tone={summary.totals.failure_rate > 0 ? "warning" : "muted"}
            />
          </div>

          {/* 未配信 (0件) 警告 */}
          {summary.silent_types.length > 0 && (
            <div className="glass-card rounded-xl border border-warning/30 bg-warning-dim/40 p-4">
              <div className="text-sm font-medium text-warning-text">この期間に配信が0件の種別</div>
              <p className="mt-1 text-xs text-secondary">
                対象顧客がいない / cron 未稼働 / 設定 OFF のいずれかの可能性があります:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.silent_types.map((t) => (
                  <span key={t} className="rounded-full bg-inset px-2 py-0.5 text-xs text-secondary">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 種別別テーブル */}
          <div className="glass-card overflow-hidden rounded-xl">
            <div className="border-b border-border-subtle px-4 py-3 text-sm font-semibold text-primary">
              種別別の配信
            </div>
            {summary.by_type.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">この期間の配信ログはありません。</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {summary.by_type.map((t) => (
                  <div key={t.type} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-primary">{t.label}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        LINE {t.line} / メール {t.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-success-text">{t.sent} 件</span>
                      {t.failed > 0 ? (
                        <span className="rounded-full bg-danger-dim px-2 py-0.5 text-xs text-danger-text">
                          失敗 {t.failed} ({pct(t.failure_rate)})
                        </span>
                      ) : (
                        <span className="text-xs text-muted">失敗なし</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 直近の失敗 */}
          {failures.length > 0 && (
            <div className="glass-card overflow-hidden rounded-xl">
              <div className="border-b border-border-subtle px-4 py-3 text-sm font-semibold text-primary">
                直近の失敗（最大20件）
              </div>
              <div className="divide-y divide-border-subtle">
                {failures.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="text-primary">{f.type}</span>
                      <span className="ml-2 text-xs text-muted">{f.channel ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="truncate max-w-[180px]">{f.recipient ?? "宛先不明"}</span>
                      <span>{fmt(f.sent_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "success" | "danger" | "warning" | "muted";
}) {
  const cls: Record<string, string> = {
    success: "text-success-text",
    danger: "text-danger-text",
    warning: "text-warning-text",
    muted: "text-secondary",
  };
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls[tone]}`}>{value}</div>
    </div>
  );
}
