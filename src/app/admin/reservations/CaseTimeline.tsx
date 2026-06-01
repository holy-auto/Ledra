"use client";

import Link from "next/link";
import type { CaseStep, CaseStepState, CaseStepAction, CaseActionKind } from "@/lib/admin/caseTimeline";

const STATE_STYLE: Record<CaseStepState, { dot: string; label: string }> = {
  done: { dot: "bg-success text-white", label: "text-primary" },
  current: { dot: "bg-accent text-white", label: "text-primary font-semibold" },
  pending: { dot: "bg-border-subtle text-muted", label: "text-muted" },
  skipped: { dot: "bg-border-subtle text-muted", label: "text-muted line-through" },
};

/**
 * 案件の連鎖タイムライン（予約→施工→証明書→請求→フォロー）を横型ステッパーで表示。
 * action を持つステップには「次のアクション」ボタンを出し、onAction で実行する。
 */
export default function CaseTimeline({
  steps,
  onAction,
  busyKind,
}: {
  steps: CaseStep[];
  onAction?: (action: CaseStepAction) => void;
  busyKind?: CaseActionKind | null;
}) {
  if (!steps?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const st = STATE_STYLE[s.state];
        const head = (
          <div className="flex flex-col items-center">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${st.dot}`}>
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className={`mt-1 text-xs ${st.label}`}>{s.label}</span>
            <span className="text-[10px] text-muted">{s.detail}</span>
          </div>
        );
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="flex min-w-[88px] flex-col items-center gap-1 rounded-lg border border-border-subtle px-2 py-2 text-center">
              {s.href ? (
                <Link href={s.href} className="transition hover:opacity-80">
                  {head}
                </Link>
              ) : (
                head
              )}
              {s.action && onAction && (
                <button
                  type="button"
                  onClick={() => onAction(s.action!)}
                  disabled={busyKind === s.action.kind}
                  className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                >
                  {busyKind === s.action.kind ? "…" : s.action.label}
                </button>
              )}
            </div>
            {i < steps.length - 1 && <span className="text-muted">→</span>}
          </div>
        );
      })}
    </div>
  );
}
