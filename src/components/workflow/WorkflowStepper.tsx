"use client";

import { useState, useEffect, useCallback } from "react";

export type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

export type StepLog = {
  step_key: string;
  step_order: number;
  started_at: string | null;
  completed_at: string | null;
  duration_sec: number | null;
};

type Props = {
  reservationId: string;
  templateId: string | null;
  steps: WorkflowStep[];
  stepLogs: StepLog[];
  currentStepOrder: number;
  progressPct: number;
  status: string;
  /** advance APIを呼び出す関数（admin用） */
  onAdvance?: (note?: string) => Promise<void>;
  /** 読み取り専用モード（詳細表示のみ） */
  readOnly?: boolean;
};

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export default function WorkflowStepper({
  reservationId,
  templateId,
  steps,
  stepLogs,
  currentStepOrder,
  progressPct,
  status,
  onAdvance,
  readOnly = false,
}: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");

  const currentStep = steps.find((s) => s.order === currentStepOrder) ?? null;
  const currentLog = stepLogs.find((l) => l.step_order === currentStepOrder) ?? null;
  const isCompleted = status === "completed";
  const isCancelled = status === "cancelled";

  // 現在のステップの経過時間カウンター
  useEffect(() => {
    if (!currentLog?.started_at || currentLog.completed_at || isCompleted) return;
    const startTime = new Date(currentLog.started_at).getTime();
    const update = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [currentLog, isCompleted]);

  const handleAdvance = useCallback(async () => {
    if (!onAdvance || advancing) return;
    setAdvancing(true);
    try {
      await onAdvance(note || undefined);
      setNote("");
      setShowNoteInput(false);
    } finally {
      setAdvancing(false);
    }
  }, [onAdvance, advancing, note]);

  if (!templateId || steps.length === 0) {
    return null;
  }

  const nextStep = steps.find((s) => s.order === currentStepOrder + 1) ?? null;

  return (
    <div className="space-y-4">
      {/* プログレスバー */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span className="font-medium">{isCompleted ? "完了" : currentStep ? currentStep.label : "準備中"}</span>
          <span className="font-semibold text-secondary">{progressPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-hover overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${
              isCompleted ? "bg-success" : "bg-accent"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ステップ一覧 */}
      <div className="space-y-1">
        {steps.map((step) => {
          const log = stepLogs.find((l) => l.step_key === step.key);
          const isActive = step.order === currentStepOrder && !isCompleted;
          const isDone = log?.completed_at != null || (isCompleted && step.order <= currentStepOrder);
          const isPending = !isActive && !isDone;

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                isActive ? "bg-accent-dim border border-accent/30" : isDone ? "bg-inset" : "opacity-50"
              }`}
            >
              {/* アイコン */}
              <div
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  isDone
                    ? "bg-success text-white"
                    : isActive
                      ? "bg-accent text-white"
                      : "bg-surface-active text-muted"
                }`}
              >
                {isDone ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : isActive ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                ) : (
                  step.order
                )}
              </div>

              {/* ラベル・情報 */}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-medium ${isActive ? "text-accent-text" : isDone ? "text-secondary" : "text-muted"}`}
                >
                  {step.label}
                  {step.is_customer_visible && <span className="ml-1.5 text-[10px] text-accent">📱</span>}
                </div>
                {isActive && currentLog?.started_at && !isCompleted && (
                  <div className="text-[11px] text-accent-text">
                    開始 {formatTime(currentLog.started_at)} · 経過 {formatDuration(elapsed)}
                  </div>
                )}
                {isDone && log?.completed_at && (
                  <div className="text-[11px] text-muted">
                    {formatTime(log.started_at)} → {formatTime(log.completed_at)}
                    {log.duration_sec ? ` (${formatDuration(log.duration_sec)})` : ""}
                  </div>
                )}
                {isPending && step.estimated_min > 0 && (
                  <div className="text-[11px] text-muted">目安 {step.estimated_min}分</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 次へボタン（読み取り専用でない、かつ完了・キャンセル以外） */}
      {!readOnly && !isCompleted && !isCancelled && onAdvance && (
        <div className="space-y-2 pt-1">
          {showNoteInput && (
            <div>
              <textarea
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                rows={2}
                placeholder="メモを追加（任意）"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdvance}
              disabled={advancing}
              className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent/90 active:bg-accent/80 disabled:opacity-60 transition-colors"
            >
              {advancing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  処理中...
                </span>
              ) : currentStepOrder === 0 ? (
                `${steps[0]?.label ?? "受付"}を開始`
              ) : nextStep ? (
                `次へ → ${nextStep.label}`
              ) : (
                "完了する"
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowNoteInput((v) => !v)}
              className={`rounded-xl border px-3 py-3 text-sm transition-colors ${
                showNoteInput
                  ? "border-accent/30 bg-accent-dim text-accent-text"
                  : "border-border-default bg-surface text-muted hover:bg-inset"
              }`}
              title="メモを追加"
            >
              ✏️
            </button>
          </div>
          {currentStep && !nextStep && (
            <p className="text-center text-xs text-muted">※ 完了すると顧客へ通知が送信されます</p>
          )}
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-success-dim border border-success/30 py-3">
          <span className="text-success-text text-sm font-medium">✅ すべての工程が完了しました</span>
        </div>
      )}
    </div>
  );
}
