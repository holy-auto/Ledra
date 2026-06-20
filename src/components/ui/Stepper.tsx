import type { ReactNode } from "react";

/**
 * Stepper — ウィザード/フローの進捗インジケータ（汎用・表示専用）。
 *
 * 証明書発行ウィザード（車両→施工→写真→署名→発行）・施工受付・署名フロー等の
 * ad-hoc 実装を統一するための design-system プリミティブ。データ連動の
 * `WorkflowStepper`（予約ランタイム）とは別レイヤ。
 *
 * 状態は `current`（0 始まりインデックス）から導出: index < current = 完了 /
 * index === current = 進行中 / それ以降 = 未着手。
 */
export interface StepItem {
  label: string;
  description?: ReactNode;
}

export default function Stepper({
  steps,
  current,
  orientation = "horizontal",
  className = "",
}: {
  steps: StepItem[];
  current: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const vertical = orientation === "vertical";

  return (
    <ol className={`flex ${vertical ? "flex-col gap-0" : "items-start gap-2"} ${className}`} aria-label="進捗ステップ">
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        const last = i === steps.length - 1;
        return (
          <li
            key={i}
            aria-current={state === "current" ? "step" : undefined}
            className={vertical ? "flex gap-3 pb-5 last:pb-0" : "flex flex-1 flex-col items-center"}
          >
            {/* marker + connector */}
            {vertical ? (
              <div className="flex flex-col items-center">
                <StepMarker state={state} index={i} />
                {!last && <span className="mt-1 w-px flex-1 bg-border-default" />}
              </div>
            ) : (
              // マーカーを左右の半コネクタで挟み、中央寄せラベルの真上に配置する。
              <div className="flex w-full items-center">
                <span
                  className={`h-px flex-1 ${i === 0 ? "bg-transparent" : i <= current ? "bg-success" : "bg-border-default"}`}
                />
                <StepMarker state={state} index={i} />
                <span
                  className={`h-px flex-1 ${last ? "bg-transparent" : i < current ? "bg-success" : "bg-border-default"}`}
                />
              </div>
            )}
            {/* label */}
            <div className={vertical ? "min-w-0 flex-1 pt-0.5" : "mt-2 px-1 text-center"}>
              <div
                className={`text-[13px] font-medium ${
                  state === "current" ? "text-primary" : state === "done" ? "text-secondary" : "text-muted"
                }`}
              >
                {step.label}
              </div>
              {step.description && <div className="mt-0.5 text-[11px] text-muted">{step.description}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepMarker({ state, index }: { state: "done" | "current" | "upcoming"; index: number }) {
  if (state === "done") {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-white">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-accent motion-safe:animate-[stepper-pulse_1.6s_var(--ease-out,ease-out)_infinite]"
          aria-hidden
        />
        <span className="relative">{index + 1}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-active text-[11px] font-semibold text-muted">
      {index + 1}
    </span>
  );
}
