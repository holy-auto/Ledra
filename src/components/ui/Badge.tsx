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

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

export default function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
