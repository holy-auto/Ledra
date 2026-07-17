"use client";

import type { StepGuideState } from "@/lib/workflow/stepChecklist";

type Props = {
  /** 現在の工程のガイド状態（`computeStepGuideState` の戻り値）。null か項目ゼロなら非表示。 */
  guide: StepGuideState | null;
  onTogglePhoto: (label: string) => void;
  onToggleCheck: (label: string) => void;
  /** 未確認のまま進めようとしたときのソフト警告を表示するか。 */
  pendingWarn?: boolean;
  /** ルート要素のクラス（省略時は既定の枠付きカード）。呼び出し側で余白等を調整する。 */
  className?: string;
};

/**
 * 工程ガイド（写真ガイド／確認チェックリスト）の表示専用コンポーネント。
 *
 * `WorkflowStepper`（予約詳細のステッパー）と `JobStatusPanel`（案件画面の進行ボタン）で
 * 共用する。判定は純関数 `computeStepGuideState`（呼び出し側で実行）に委ね、ここは描画のみ。
 * ベテランが工程に宣言した「撮る写真」「確認項目」を作業者へ提示し、タップで確認済みにできる。
 * 思想「強制停止は最小限」に従い、警告表示のみでブロックはしない。
 */
export default function StepGuidePanel({ guide, onTogglePhoto, onToggleCheck, pendingWarn = false, className }: Props) {
  if (!guide || guide.total === 0) return null;

  return (
    <div className={className ?? "rounded-xl border border-border-subtle bg-inset p-3 space-y-2.5"}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.14em] text-muted">この工程のガイド</span>
        <span className={`text-[11px] font-semibold ${guide.allSatisfied ? "text-success-text" : "text-muted"}`}>
          {guide.allSatisfied ? "✓ 確認済み" : `未確認 ${guide.outstanding}件`}
        </span>
      </div>

      {pendingWarn && guide.outstanding > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-dim px-3 py-2 text-[11px] text-warning-text">
          未確認の項目が {guide.outstanding}{" "}
          件あります。撮り忘れ・確認漏れがないかご確認ください。問題なければ「このまま進める」を押してください。
        </div>
      )}

      {guide.photos.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted">📸 撮る写真</div>
          <div className="flex flex-wrap gap-1.5">
            {guide.photos.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onTogglePhoto(p.label)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  p.done
                    ? "border-success/30 bg-success-dim text-success-text"
                    : "border-border-default bg-surface text-secondary hover:bg-surface-hover"
                }`}
              >
                {p.done ? "✓ " : "○ "}
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {guide.checks.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted">✓ 確認項目</div>
          <div className="flex flex-col gap-1">
            {guide.checks.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => onToggleCheck(c.label)}
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-xs text-secondary hover:bg-surface-hover"
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] ${
                    c.done ? "border-success bg-success text-white" : "border-border-default bg-surface"
                  }`}
                >
                  {c.done ? "✓" : ""}
                </span>
                <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
