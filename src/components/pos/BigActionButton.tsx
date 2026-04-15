"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * BigActionButton
 * ------------------------------------------------------------
 * 店頭モード (POS 風) で使う大判アクションボタン。
 *  - 最低タップ領域 80px 四方を確保 (50〜60 代でも押しやすい)
 *  - アイコン + タイトル + サブテキストの 3 段構成
 *  - トーンで状態を伝える (primary / neutral / warning / success / danger)
 *  - href か onClick のどちらかを受ける。href なら Next.js Link、無ければ button。
 */

export type BigActionTone = "primary" | "neutral" | "warning" | "success" | "danger";

type Props = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  tone?: BigActionTone;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** 右下に表示する短いヒント (例: "3件待ち") */
  hint?: string;
  className?: string;
};

function toneClasses(tone: BigActionTone, disabled: boolean): string {
  if (disabled) {
    return "border-border-subtle bg-inset text-muted cursor-not-allowed";
  }
  switch (tone) {
    case "primary":
      return "border-accent/30 bg-accent-dim text-accent-text hover:bg-accent/15 hover:border-accent/50";
    case "warning":
      return "border-warning/30 bg-warning-dim text-warning-text hover:bg-warning/15 hover:border-warning/50";
    case "success":
      return "border-success/30 bg-success-dim text-success-text hover:bg-success/15 hover:border-success/50";
    case "danger":
      return "border-danger/30 bg-danger-dim text-danger-text hover:bg-danger/15 hover:border-danger/50";
    case "neutral":
    default:
      return "border-border-default bg-surface text-primary hover:bg-surface-hover";
  }
}

function toneIconBg(tone: BigActionTone, disabled: boolean): string {
  if (disabled) return "bg-surface-hover text-muted";
  switch (tone) {
    case "primary":
      return "bg-accent/15 text-accent";
    case "warning":
      return "bg-warning/15 text-warning";
    case "success":
      return "bg-success/15 text-success";
    case "danger":
      return "bg-danger/15 text-danger";
    case "neutral":
    default:
      return "bg-inset text-secondary";
  }
}

export default function BigActionButton({
  icon,
  title,
  subtitle,
  badge,
  tone = "neutral",
  href,
  onClick,
  disabled = false,
  hint,
  className = "",
}: Props) {
  const sharedClasses = `group relative flex min-h-[104px] w-full flex-col items-start gap-2 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 ${toneClasses(
    tone,
    disabled,
  )} ${className}`;

  const inner = (
    <>
      <div className="flex w-full items-center justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneIconBg(tone, disabled)}`}>
          {icon}
        </span>
        {badge != null && <span className="shrink-0">{badge}</span>}
      </div>
      <div className="min-w-0">
        <div className="text-base font-bold leading-tight">{title}</div>
        {subtitle && <div className="mt-0.5 text-[12px] font-medium opacity-80 leading-snug">{subtitle}</div>}
      </div>
      {hint && <div className="mt-auto text-[11px] font-medium opacity-75">{hint}</div>}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={sharedClasses}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={sharedClasses}>
      {inner}
    </button>
  );
}
