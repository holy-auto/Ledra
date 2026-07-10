"use client";

import { useEffect, useState } from "react";

export type CertFormSection = { id: string; label: string };

/**
 * 証明書発行フォーム用の進捗レール。今どのセクションにいるか・残りいくつあるかを
 * 常に見えるようにする（フォームが長く、進捗表示が無いという指摘への対応）。
 */
export default function CertFormProgressRail({ sections }: { sections: CertFormSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);

  // セクション構成が変わって(テンプレート切替等) activeId が消えたら、
  // 次の IntersectionObserver 発火まで古いラベルが出続けないようリセットする。
  useEffect(() => {
    if (!sections.some((s) => s.id === activeId)) {
      setActiveId(sections[0]?.id);
    }
  }, [sections, activeId]);

  useEffect(() => {
    const targets = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === activeId),
  );

  return (
    <div className="sticky top-2 z-10 mb-4 rounded-xl border border-border-default bg-surface/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted">
          {activeIndex + 1} / {sections.length} — {sections[activeIndex]?.label}
        </span>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto">
        {sections.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            title={s.label}
            aria-current={s.id === activeId ? "step" : undefined}
            className={`h-1.5 flex-1 min-w-[16px] rounded-full transition-colors ${
              i <= activeIndex ? "bg-accent" : "bg-border-default hover:bg-border-strong"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
