import type { ReactNode, HTMLAttributes } from "react";

type CardVariant = "default" | "elevated" | "inset";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "compact" | "default" | "none";
  children: ReactNode;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: "glass-card",
  elevated: "glass-card shadow-lg",
  inset: "rounded-[var(--radius-lg)] bg-inset",
};

const PADDING_CLASSES: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  compact: "p-4",
  default: "p-5",
};

export default function Card({
  variant = "default",
  padding = "default",
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div className={`${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
