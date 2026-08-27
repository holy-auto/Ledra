import type { ReactNode } from "react";
import { VARIANT_TINT_CLASSES } from "@/components/ui/Badge";

export type AlertVariant = "info" | "success" | "warning" | "danger";

/** アイコン+ラベル+色の三重シグナル(v2.0 §3.2: 色のみに依存しない)。18x18 / stroke 1.5 規約。 */
const VARIANT_ICONS: Record<AlertVariant, ReactNode> = {
  info: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  ),
  success: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  ),
  warning: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  danger: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
};

interface AlertProps {
  variant?: AlertVariant;
  /** 強調見出し(任意)。本文は children。 */
  title?: string;
  children: ReactNode;
  /** 既定アイコンの差し替え(18x18 / strokeWidth 1.5 のインライン SVG 規約に従うこと)。 */
  icon?: ReactNode;
  /** 右端のアクション(例: <Button size="sm">再試行</Button>)。 */
  action?: ReactNode;
  className?: string;
}

/**
 * インライン警告/通知の共通プリミティブ。
 * admin 各所の「rounded-* border border-〈色〉/20 bg-〈色〉-dim text-〈色〉-text」直書きパターンの共通化。
 */
export default function Alert({ variant = "info", title, children, icon, action, className = "" }: AlertProps) {
  return (
    <div
      role={variant === "danger" || variant === "warning" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 ${VARIANT_TINT_CLASSES[variant]} ${className}`}
    >
      <span className="mt-0.5 shrink-0">{icon ?? VARIANT_ICONS[variant]}</span>
      <div className="min-w-0 flex-1 text-small">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}
