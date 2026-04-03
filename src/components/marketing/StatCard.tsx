"use client";

import { AnimatedCounter } from "./AnimatedCounter";

/**
 * StatCard — Client Component
 * AnimatedCounter (IntersectionObserver + rAF) を含むため "use client" が必要。
 * ScrollReveal ラップは page.tsx 側で行う（Server Component のまま保持するため）。
 */
export function StatCard({ value, label }: { value: string; label: string }) {
  // Parse numeric value for counter animation
  const numericMatch = value.match(/^([\d,]+)/);
  const numericValue = numericMatch ? parseInt(numericMatch[1].replace(/,/g, "")) : null;
  const suffix = numericMatch ? value.slice(numericMatch[0].length) : "";

  return (
    <div className="text-center px-8">
      <div className="text-[2.75rem] md:text-[3.5rem] font-bold text-white leading-tight tracking-tight">
        {numericValue !== null ? <AnimatedCounter target={numericValue} suffix={suffix} /> : value}
      </div>
      <div className="mt-3 text-sm text-white/45 font-medium">{label}</div>
    </div>
  );
}
