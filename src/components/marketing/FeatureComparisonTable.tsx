"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Row = {
  readonly feature: string;
  readonly free: string;
  readonly starter: string;
  readonly standard: string;
  readonly pro: string;
};

export function FeatureComparisonTable({ rows }: { rows: readonly Row[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  const stickyBg = "bg-[#0a0f1a]";

  return (
    <div className="relative">
      {/* Left fade */}
      <div
        className={`pointer-events-none absolute left-0 top-0 bottom-0 z-20 w-8 bg-gradient-to-r from-[#0a0f1a] to-transparent transition-opacity duration-300 md:hidden ${
          canScrollLeft ? "opacity-100" : "opacity-0"
        }`}
        style={{ left: "140px" }}
      />
      {/* Right fade */}
      <div
        className={`pointer-events-none absolute right-0 top-0 bottom-0 z-20 w-8 bg-gradient-to-l from-[#0a0f1a] to-transparent transition-opacity duration-300 md:hidden ${
          canScrollRight ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        ref={scrollRef}
        className="overflow-x-auto"
        onScroll={updateScrollState}
      >
        <table className="w-full max-w-5xl mx-auto text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th
                className={`text-left py-4 px-4 font-medium text-white/40 sticky left-0 z-10 ${stickyBg} min-w-[140px]`}
              >
                機能
              </th>
              <th className="text-center py-4 px-4 font-medium text-white min-w-[100px]">
                フリー
              </th>
              <th className="text-center py-4 px-4 font-medium text-white min-w-[100px]">
                スターター
              </th>
              <th className="text-center py-4 px-4 font-medium text-blue-400 min-w-[100px]">
                スタンダード
              </th>
              <th className="text-center py-4 px-4 font-medium text-white min-w-[100px]">
                プロ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map((row) => (
              <tr
                key={row.feature}
                className="group hover:bg-white/[0.03] transition-colors"
              >
                <td
                  className={`py-3.5 px-4 text-white font-medium sticky left-0 z-10 ${stickyBg} group-hover:bg-[#0b1120] transition-colors`}
                >
                  {row.feature}
                </td>
                <td className="py-3.5 px-4 text-center text-white/60">
                  {row.free}
                </td>
                <td className="py-3.5 px-4 text-center text-white/60">
                  {row.starter}
                </td>
                <td className="py-3.5 px-4 text-center text-blue-400 font-medium">
                  {row.standard}
                </td>
                <td className="py-3.5 px-4 text-center text-white/60">
                  {row.pro}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scroll hint on mobile */}
      {canScrollRight && (
        <div className="md:hidden flex items-center justify-center gap-1.5 mt-3 text-xs text-white/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          スクロールで全プランを表示
        </div>
      )}
    </div>
  );
}
