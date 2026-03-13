import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-[rgba(0,0,0,0.04)] text-[#6e6e73] border-[rgba(0,0,0,0.08)]",
  success: "bg-[rgba(40,167,69,0.08)] text-[#1a7f37] border-[rgba(40,167,69,0.2)]",
  warning: "bg-[rgba(240,147,0,0.08)] text-[#b35c00] border-[rgba(240,147,0,0.2)]",
  danger: "bg-[rgba(255,59,48,0.08)] text-[#d1242f] border-[rgba(255,59,48,0.2)]",
  info: "bg-[rgba(0,113,227,0.08)] text-[#0071e3] border-[rgba(0,113,227,0.2)]",
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
