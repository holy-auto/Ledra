"use client";

import { useState } from "react";
import useSWR from "swr";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import type { SquareSyncRun } from "@/types/square";
import type { BadgeVariant } from "@/lib/statusMaps";

type SyncHistoryData = {
  runs: SquareSyncRun[];
};

const syncStatusVariant = (s: string): BadgeVariant => {
  switch (s) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "failed":
      return "danger";
    case "partial":
      return "warning";
    default:
      return "default";
  }
};

const syncStatusLabel = (s: string): string => {
  switch (s) {
    case "completed":
      return "完了";
    case "running":
      return "実行中";
    case "failed":
      return "失敗";
    case "partial":
      return "一部成功";
    default:
      return s;
  }
};

const triggerLabel = (t: string): string => {
  switch (t) {
    case "manual":
      return "手動";
    case "scheduled":
      return "定期";
    case "webhook":
      return "Webhook";
    default:
      return t;
  }
};

export default function SyncHistoryPanel() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useSWR<SyncHistoryData>(
    "/api/admin/square/sync-runs",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  if (isLoading) {
    return (
      <section className="glass-card p-5">
        <div className="text-sm text-muted">同期履歴を読み込み中…</div>
      </section>
    );
  }

  const runs = data?.runs ?? [];

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">同期履歴</div>
      </div>

      {runs.length === 0 ? (
        <div className="p-5 text-sm text-muted text-center">同期履歴がありません</div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {runs.map((run) => (
            <div key={run.id} className="hover:bg-surface-hover/60">
              <button
                type="button"
                className="w-full text-left px-5 py-3.5 flex items-center gap-4"
                onClick={() =>
                  setExpandedId(expandedId === run.id ? null : run.id)
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={syncStatusVariant(run.status)}>
                      {syncStatusLabel(run.status)}
                    </Badge>
                    <span className="text-xs text-muted">
                      {triggerLabel(run.trigger_type)}
                    </span>
                    {run.triggered_by && (
                      <span className="text-xs text-muted truncate">
                        by {run.triggered_by}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {formatDateTime(run.started_at)}
                    {run.finished_at && (
                      <span> → {formatDateTime(run.finished_at)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-secondary shrink-0">
                  <span>
                    取得: <b className="text-primary">{run.orders_fetched}</b>
                  </span>
                  <span>
                    取込: <b className="text-primary">{run.orders_imported}</b>
                  </span>
                  <span>
                    スキップ: <b className="text-muted">{run.orders_skipped}</b>
                  </span>
                  {run.errors_json.length > 0 && (
                    <span>
                      エラー:{" "}
                      <b className="text-red-400">{run.errors_json.length}</b>
                    </span>
                  )}
                  <span className="text-muted">
                    {expandedId === run.id ? "▲" : "▼"}
                  </span>
                </div>
              </button>

              {/* Expanded error details */}
              {expandedId === run.id && run.errors_json.length > 0 && (
                <div className="px-5 pb-4">
                  <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-3 space-y-2">
                    <div className="text-xs font-semibold text-red-400">
                      エラー詳細
                    </div>
                    {run.errors_json.map((error: any, idx: number) => (
                      <div
                        key={idx}
                        className="text-xs text-red-300 font-mono break-all"
                      >
                        {typeof error === "string"
                          ? error
                          : JSON.stringify(error, null, 2)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expandedId === run.id && run.errors_json.length === 0 && (
                <div className="px-5 pb-4">
                  <div className="text-xs text-muted">エラーなし</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
