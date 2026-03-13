"use client";

import { ScrollReveal } from "./ScrollReveal";
import { AnimatedCounter } from "./AnimatedCounter";

export function StatCard({
  value,
  label,
  delay = 0,
}: {
  value: string;
  label: string;
  delay?: number;
}) {
  // Parse numeric value for counter animation
  const numericMatch = value.match(/^([\d,]+)/);
  const numericValue = numericMatch ? parseInt(numericMatch[1].replace(/,/g, "")) : null;
  const suffix = numericMatch ? value.slice(numericMatch[0].length) : "";

  return (
    <ScrollReveal variant="scale-up" delay={delay}>
      <div className="text-center px-8">
        <div className="text-[2.75rem] md:text-[3.5rem] font-bold text-heading leading-tight tracking-tight">
          {numericValue !== null ? (
            <AnimatedCounter target={numericValue} suffix={suffix} />
          ) : (
            value
          )}
        </div>
        <div className="mt-3 text-sm text-muted font-medium">{label}</div>
      </div>
    </ScrollReveal>
  );
}
