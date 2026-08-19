import type { ReactNode } from "react";

interface ProgressCardProps {
  label: string;
  /** 完了数。total とのペアで「左に件数」を描く(v2.0 §5.2)。 */
  completed: number;
  total: number;
  /**
   * 円の進捗率(0-100)。省略時は completed/total から算出する。
   * v2.0 §5.2 の「各 Job の完了 Step 比率の平均」のように件数比と異なる進捗率を
   * 表示する場合は、呼び出し側で算出してここに渡す(件数表示と独立)。
   */
  percent?: number;
  caption?: string;
  /** 件数表示の下に出す補助要素(任意)。 */
  children?: ReactNode;
  className?: string;
}

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * 進捗カード(件数+円形プログレス)。表示専用。既定の進捗率は completed/total、
 * 件数比と異なる進捗率(Step 比率平均等)は percent プロップで上書きする。
 * total=0 のときは 0% として扱う(ゼロ除算ガード)。
 */
export default function ProgressCard({
  label,
  completed,
  total,
  percent: percentProp,
  caption,
  children,
  className = "",
}: ProgressCardProps) {
  const ratio =
    percentProp != null
      ? Math.min(Math.max(percentProp, 0), 100) / 100
      : total > 0
        ? Math.min(Math.max(completed / total, 0), 1)
        : 0;
  const percent = Math.round(ratio * 100);
  return (
    <div className={`glass-card flex items-center justify-between gap-4 p-5 ${className}`}>
      <div className="min-w-0">
        <span className="section-tag">{label}</span>
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-primary">
          {completed}
          <span className="text-base font-normal text-muted"> / {total}</span>
        </div>
        {caption && <p className="mt-1 text-small text-muted">{caption}</p>}
        {children}
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${percent}%`}
        className="relative shrink-0"
      >
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="var(--bg-inset)" strokeWidth="7" />
          <circle
            cx="36"
            cy="36"
            r={RADIUS}
            fill="none"
            stroke="var(--accent-blue)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
            transform="rotate(-90 36 36)"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold text-primary">
          {percent}%
        </span>
      </div>
    </div>
  );
}
