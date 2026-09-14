import type { ReactNode } from "react";
import type { BadgeVariant } from "@/lib/statusMaps";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-surface-hover text-secondary border-border-default",
  success: "bg-success-dim text-success-text border-success/20",
  warning: "bg-warning-dim text-warning-text border-warning/20",
  danger: "bg-danger-dim text-danger-text border-danger/20",
  info: "bg-accent-dim text-accent-text border-accent/20",
  violet: "bg-violet-dim text-violet-text border-violet/20",
};

/** variant → 淡色ティントのクラス組。Alert / StatusCard 等の面ティントにも共用する。 */
export const VARIANT_TINT_CLASSES = VARIANT_CLASSES;

const DOT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-border-strong",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-accent",
  violet: "bg-violet",
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** 状態ドット(色+形状の二重シグナル)。色のみに依存しない v2.0 §3.2 対応。 */
  dot?: boolean;
}

export default function Badge({ children, variant = "default", dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[variant]}`} />}
      {children}
    </span>
  );
}
