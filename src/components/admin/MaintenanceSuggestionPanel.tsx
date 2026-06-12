"use client";

/**
 * AI 整備提案パネル。
 *
 * 顧客 + 車両 を渡すと、POST /api/admin/ai/maintenance-suggestion で
 * 整備提案メッセージ (件名・本文・緊急度) を生成し表示する。
 *
 * 生成結果はメモリ内のみ (永続化しない)。本文は「コピー」でクリップボードへ。
 * LINE 送信用の compose 画面は存在しないため、「LINE用にコピー」も
 * クリップボードへのコピーにフォールバックする。
 */
import { useState } from "react";

interface Suggestion {
  subject: string;
  body: string;
  urgency: "low" | "medium" | "high";
}

interface ApiResponse {
  ok?: boolean;
  suggestion: Suggestion | null;
  reminders_count: number;
  has_overdue: boolean;
  message?: string;
  error?: string;
}

interface Props {
  customerId: string;
  vehicleId?: string | null;
  customerName: string;
}

const URGENCY_STYLE: Record<Suggestion["urgency"], { label: string; cls: string }> = {
  low: { label: "低", cls: "bg-green-400/10 text-green-400 border-green-400/30" },
  medium: { label: "中", cls: "bg-warning-dim text-warning border-warning/30" },
  high: { label: "高", cls: "bg-red-400/10 text-red-400 border-red-400/30" },
};

export default function MaintenanceSuggestionPanel({ customerId, vehicleId, customerName }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setErr(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/ai/maintenance-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          ...(vehicleId ? { vehicle_id: vehicleId } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as ApiResponse;
      if (res.status === 401 || res.status === 403) {
        setErr(j?.message ?? "この操作を行う権限がありません。");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール上限に達しました。しばらくしてからお試しください。");
        return;
      }
      if (!res.ok) {
        setErr(j?.message ?? j?.error ?? "提案の生成に失敗しました。");
        return;
      }
      setResult(j);
      if (!j.suggestion) {
        setErr("AI 提案を生成できませんでした。もう一度お試しください。");
      }
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function copyBody() {
    if (!result?.suggestion) return;
    try {
      await navigator.clipboard.writeText(result.suggestion.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("クリップボードへのコピーに失敗しました。");
    }
  }

  const suggestion = result?.suggestion ?? null;
  const urgency = suggestion ? URGENCY_STYLE[suggestion.urgency] : null;

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">AI MAINTENANCE</div>
          <div className="mt-0.5 text-base font-semibold text-primary">AI整備提案</div>
        </div>
        {result ? (
          <span className="text-[10px] text-muted">
            提案対象 {result.reminders_count} 件{result.has_overdue ? " · 期限超過あり" : ""}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted">
        {customerName} 様の整備状況・施工履歴・走行距離をもとに、フォローアップメッセージの下書きを生成します。
      </p>

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-dim px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/15 disabled:opacity-60"
      >
        {loading ? (
          <>
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"
            />
            生成中…
          </>
        ) : (
          "AI整備提案を生成"
        )}
      </button>

      {err ? (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">{err}</div>
      ) : null}

      {suggestion ? (
        <div className="rounded-xl border border-border-default bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted">緊急度</span>
            {urgency ? (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${urgency.cls}`}>
                {urgency.label}
              </span>
            ) : null}
          </div>

          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">件名</div>
            <div className="mt-0.5 text-sm font-semibold text-primary">{suggestion.subject}</div>
          </div>

          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">本文</div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-primary leading-relaxed">{suggestion.body}</p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={copyBody}
              className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover hover:border-border-strong"
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
            <button
              type="button"
              onClick={copyBody}
              className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover hover:border-border-strong"
            >
              LINE用にコピー
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
