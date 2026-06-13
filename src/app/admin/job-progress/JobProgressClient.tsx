"use client";

import { useEffect, useRef, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";
import PageHeader from "@/components/ui/PageHeader";
import { JOB_STATUSES, JOB_STATUS_LABELS, nextJobStatus, type JobStatus } from "@/lib/validations/job-progress";

// ─── 型定義 ──────────────────────────────────────────────────────
interface JobCard {
  id: string;
  invoice_number: string | null;
  job_status: JobStatus;
  total: number;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_id: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  updated_at: string | null;
}

interface BoardResponse {
  ok: boolean;
  columns: Record<JobStatus, JobCard[]>;
  counts: Record<JobStatus, number>;
  total: number;
}

// ステージ別のヘッダ配色 (アクセントのトーン分け)。
const COLUMN_ACCENT: Record<JobStatus, string> = {
  draft: "text-muted",
  booked: "text-accent",
  in_progress: "text-warning",
  qc: "text-warning",
  ready: "text-success",
  delivered: "text-secondary",
};

// ─── ユーティリティ ───────────────────────────────────────────────
function jpy(n: number): string {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}

function vehicleLabel(c: JobCard): string {
  const base = [c.vehicle_maker, c.vehicle_model].filter(Boolean).join(" ");
  const label = base || "車両未登録";
  return c.vehicle_plate ? `${label} ・ ${c.vehicle_plate}` : label;
}

function emptyColumns(): Record<JobStatus, JobCard[]> {
  const out = {} as Record<JobStatus, JobCard[]>;
  for (const s of JOB_STATUSES) out[s] = [];
  return out;
}

function emptyCounts(): Record<JobStatus, number> {
  const out = {} as Record<JobStatus, number>;
  for (const s of JOB_STATUSES) out[s] = 0;
  return out;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function JobProgressClient() {
  const [columns, setColumns] = useState<Record<JobStatus, JobCard[]>>(emptyColumns());
  const [counts, setCounts] = useState<Record<JobStatus, number>>(emptyCounts());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(type: "success" | "error", msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function fetchBoard() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/job-progress", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as BoardResponse;
      setColumns(json.columns ?? emptyColumns());
      setCounts(json.counts ?? emptyCounts());
    } catch {
      showToast("error", "進捗データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  // 初回マウントで取得。fetchBoard は毎レンダー再生成されるため deps から除外する。
  useEffect(() => {
    fetchBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(card: JobCard, status: JobStatus) {
    if (status === card.job_status) return;
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/admin/job-progress/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        line_notified?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "更新に失敗しました");
      }
      if (status === "ready" && json.line_notified) {
        showToast("success", "引渡待ちに更新し、お客様へLINE通知しました");
      } else {
        showToast("success", `「${JOB_STATUS_LABELS[status]}」に更新しました`);
      }
      await fetchBoard();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        tag="業務"
        title="作業進捗ボード"
        description="請求書 (案件) を施工ステージ別に管理します。「引渡待ち」に進めると、LINE連携済みのお客様へ自動でお引き取り案内を送信します。"
        actions={
          <button onClick={fetchBoard} className="btn-secondary" disabled={loading}>
            再読み込み
          </button>
        }
      />

      {loading ? (
        <div className="glass-card flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {JOB_STATUSES.map((status) => (
            <div key={status} className="glass-card flex min-h-[200px] flex-col p-3">
              <div className="mb-3 flex items-center justify-between border-b border-border-default pb-2">
                <span className={`text-sm font-semibold ${COLUMN_ACCENT[status]}`}>{JOB_STATUS_LABELS[status]}</span>
                <CountBadge n={counts[status] ?? 0} />
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                {(columns[status] ?? []).length === 0 ? (
                  <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-muted">
                    案件なし
                  </div>
                ) : (
                  (columns[status] ?? []).map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      busy={busyId === card.id}
                      onAdvance={() => updateStatus(card, nextJobStatus(card.job_status))}
                      onSetStatus={(s) => updateStatus(card, s)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 小コンポーネント ─────────────────────────────────────────────
function Card({
  card,
  busy,
  onAdvance,
  onSetStatus,
}: {
  card: JobCard;
  busy: boolean;
  onAdvance: () => void;
  onSetStatus: (s: JobStatus) => void;
}) {
  const isLast = card.job_status === "delivered";
  return (
    <div className="rounded-lg border border-border-default bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-primary">{card.customer_name || "顧客未設定"}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{card.invoice_number || "—"}</span>
      </div>
      <div className="mt-1 text-xs text-secondary">{vehicleLabel(card)}</div>
      <div className="mt-2 text-sm font-semibold text-accent">{jpy(card.total)}</div>

      <MutationGuard>
        <div className="mt-3 space-y-2">
          {!isLast && (
            <button
              onClick={onAdvance}
              disabled={busy}
              className="btn-primary w-full px-3 py-1.5 text-xs disabled:opacity-40"
            >
              次のステップへ →
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            ステージ変更
            <select
              value={card.job_status}
              disabled={busy}
              onChange={(e) => onSetStatus(e.target.value as JobStatus)}
              className="flex-1 rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </MutationGuard>
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-hover px-1.5 text-[11px] font-bold text-secondary">
      {n}
    </span>
  );
}
