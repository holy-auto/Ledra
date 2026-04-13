"use client";

import { useEffect, useState, useCallback } from "react";

export type ProgressStep = {
  label: string;
  status: "completed" | "in_progress" | "pending";
  completed_at?: string | null;
  started_at?: string | null;
};

export type ProgressData = {
  progress_pct: number;
  current_step: { label: string; started_at: string } | null;
  steps: ProgressStep[];
  estimated_completion?: string | null;
  is_completed: boolean;
};

type Props = {
  tenantSlug: string;
  reservationId: string;
  /** ポーリング間隔（ms）, 0でポーリング無効 */
  pollIntervalMs?: number;
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export default function CustomerProgressBar({ tenantSlug, reservationId, pollIntervalMs = 30000 }: Props) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/customer/progress?tenant=${encodeURIComponent(tenantSlug)}&reservation_id=${encodeURIComponent(reservationId)}`,
      );
      if (!res.ok) {
        setError("進捗の取得に失敗しました");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, reservationId]);

  useEffect(() => {
    fetchProgress();
    if (pollIntervalMs > 0) {
      const timer = setInterval(fetchProgress, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchProgress, pollIntervalMs]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-border-default bg-surface p-5">
        <div className="h-3 bg-inset rounded-full w-3/4 mb-3" />
        <div className="h-2 bg-inset rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const { progress_pct, current_step, steps, estimated_completion, is_completed } = data;

  return (
    <div className="rounded-2xl border border-border-default bg-surface overflow-hidden shadow-sm">
      {/* ヘッダー */}
      <div
        className={`px-5 py-4 ${
          is_completed
            ? "bg-gradient-to-r from-emerald-600 to-emerald-500"
            : "bg-gradient-to-r from-indigo-700 to-indigo-500"
        }`}
      >
        <div className="text-white text-sm font-medium opacity-90">施工進捗</div>
        <div className="text-white text-2xl font-bold mt-0.5">{is_completed ? "完了！" : `${progress_pct}%`}</div>
        {!is_completed && current_step && (
          <div className="text-white/80 text-xs mt-0.5">
            現在: {current_step.label}
            {current_step.started_at && ` (${formatTime(current_step.started_at)}開始)`}
          </div>
        )}
        {!is_completed && estimated_completion && (
          <div className="text-white/70 text-xs">完了予定: {estimated_completion}</div>
        )}
      </div>

      {/* プログレスバー */}
      <div className="h-1.5 bg-inset">
        <div
          className={`h-1.5 transition-all duration-1000 ${is_completed ? "bg-emerald-500" : "bg-indigo-500"}`}
          style={{ width: `${progress_pct}%` }}
        />
      </div>

      {/* ステップ一覧 */}
      <div className="p-4 space-y-0.5">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              step.status === "in_progress"
                ? "bg-indigo-50 dark:bg-indigo-950/40"
                : step.status === "completed"
                  ? ""
                  : "opacity-40"
            }`}
          >
            <div
              className={`h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center ${
                step.status === "completed"
                  ? "bg-emerald-500"
                  : step.status === "in_progress"
                    ? "bg-indigo-500"
                    : "bg-border-default"
              }`}
            >
              {step.status === "completed" ? (
                <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : step.status === "in_progress" ? (
                <span className="animate-ping inline-flex h-2 w-2 rounded-full bg-white opacity-90" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${
                  step.status === "completed"
                    ? "text-secondary"
                    : step.status === "in_progress"
                      ? "text-indigo-700 font-semibold dark:text-indigo-300"
                      : "text-muted"
                }`}
              >
                {step.label}
              </span>
              {step.status === "completed" && step.completed_at && (
                <span className="ml-2 text-[11px] text-muted">{formatTime(step.completed_at)}完了</span>
              )}
              {step.status === "in_progress" && step.started_at && (
                <span className="ml-2 text-[11px] text-indigo-400 dark:text-indigo-400">{formatTime(step.started_at)}開始</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {is_completed && (
        <div className="px-5 pb-4 text-center">
          <p className="text-sm text-secondary">ご来店ありがとうございました。お気をつけてお帰りください。</p>
        </div>
      )}
    </div>
  );
}
