import { ScrollReveal } from "./ScrollReveal";

type MediaItem = {
  outlet: string;
  date: string;
  headline: string;
  category: string;
};

const MEDIA: MediaItem[] = [
  {
    outlet: "自動車業界ジャーナル",
    date: "2026.03",
    category: "Industry",
    headline: "デジタル施工証明という新しい潮流 — 業界の信頼基盤を再設計するLedraの挑戦",
  },
  {
    outlet: "保険ビジネスレビュー",
    date: "2026.02",
    category: "Insurance",
    headline: "査定現場のDX加速 — 施工エビデンスのデジタル化が変える車両保険の在り方",
  },
  {
    outlet: "MOBILITY TECH",
    date: "2026.01",
    category: "SaaS",
    headline: "「現場の技術」を可視化するスタートアップ Ledra、5プロダクト戦略を発表",
  },
];

export function MediaCoverage() {
  return (
    <div className="space-y-3 md:space-y-4">
      {MEDIA.map((item, i) => (
        <ScrollReveal key={item.headline} variant="fade-up" delay={i * 100}>
          <article className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-400 px-6 py-5 md:px-9 md:py-7">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-7">
              <div className="md:w-48 flex md:flex-col items-baseline md:items-start gap-3 md:gap-1">
                <div
                  className="text-sm md:text-base font-semibold text-white tracking-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {item.outlet}
                </div>
                <div className="flex items-center gap-3 text-[0.6875rem] text-white/50">
                  <span className="tracking-widest">{item.date}</span>
                  <span className="hidden md:inline w-px h-3 bg-white/15" />
                  <span className="font-semibold tracking-[0.18em] uppercase text-blue-400/80">{item.category}</span>
                </div>
              </div>
              <div className="hidden md:block w-px self-stretch bg-white/[0.06]" aria-hidden="true" />
              <p className="flex-1 text-[0.9375rem] md:text-base leading-[1.7] text-white/80 group-hover:text-white transition-colors">
                {item.headline}
              </p>
              <div
                className="hidden md:flex items-center justify-center w-9 h-9 rounded-full border border-white/[0.08] text-white/40 group-hover:text-white/80 group-hover:border-white/30 transition-colors"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                  <path d="M7 17L17 7M17 7H9M17 7V15" />
                </svg>
              </div>
            </div>
          </article>
        </ScrollReveal>
      ))}
    </div>
  );
}
