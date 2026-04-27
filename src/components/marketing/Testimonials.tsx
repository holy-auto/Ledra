import { ScrollReveal } from "./ScrollReveal";

type Testimonial = {
  quote: string;
  author: string;
  role: string;
  company: string;
  result?: { value: string; label: string };
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "施工内容を一枚のURLで顧客と共有できるようになり、お客様からの問い合わせが目に見えて減りました。何より、自分の仕事を「証明」できることが、職人としての誇りになっています。",
    author: "代表",
    role: "コーティング専門店",
    company: "ガレージ・カトウ（神奈川）",
    result: { value: "60%", label: "問い合わせ対応時間の削減" },
  },
  {
    quote:
      "従来は施工写真と保証書をPDFで管理していましたが、Ledra導入後は発行・検索・送付がすべて数クリックで完結。査定担当者からの信頼性照会にも即時に対応できるようになりました。",
    author: "業務改革推進部",
    role: "保険会社（損保）",
    company: "（社名非公開）",
    result: { value: "1/3", label: "照会対応工数を圧縮" },
  },
  {
    quote:
      "中古車買取査定の現場で、施工証明書の有無は車両価値に直結します。Ledraの記録があるだけで、買取側との交渉に明確な根拠が生まれ、施工店への信頼にも繋がっています。",
    author: "中古車事業部 部長",
    role: "自動車流通",
    company: "オートディーラーズ・ジャパン",
  },
];

export function Testimonials() {
  return (
    <div className="space-y-8 md:space-y-10">
      {/* Featured testimonial */}
      <ScrollReveal variant="fade-up" delay={0}>
        <FeaturedQuote testimonial={TESTIMONIALS[0]} />
      </ScrollReveal>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {TESTIMONIALS.slice(1).map((t, i) => (
          <ScrollReveal key={t.company} variant="fade-up" delay={150 + i * 120}>
            <CompactQuote testimonial={t} />
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}

function FeaturedQuote({ testimonial }: { testimonial: Testimonial }) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-8 md:p-14">
      <div
        className="absolute top-8 left-8 md:top-10 md:left-12 text-[6rem] md:text-[10rem] leading-none text-blue-400/20 select-none pointer-events-none"
        style={{ fontFamily: "var(--font-serif)" }}
        aria-hidden="true"
      >
        “
      </div>
      <div className="relative grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
        <div className="md:col-span-8 md:pl-16">
          <p
            className="text-xl md:text-[1.625rem] font-medium leading-[1.85] text-white tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {testimonial.quote}
          </p>
          <div className="mt-8 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500/40 to-violet-500/30 flex items-center justify-center text-sm font-bold text-white">
              {testimonial.author.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {testimonial.author}
                <span className="ml-2 text-xs font-normal text-white/60">— {testimonial.role}</span>
              </div>
              <div className="text-xs text-white/55 mt-0.5">{testimonial.company}</div>
            </div>
          </div>
        </div>
        {testimonial.result && (
          <div className="md:col-span-4 md:border-l md:border-white/[0.08] md:pl-10 border-t md:border-t-0 border-white/[0.08] pt-6 md:pt-0">
            <div className="text-[0.6875rem] font-semibold tracking-[0.22em] uppercase text-blue-400 mb-3">Impact</div>
            <div
              className="text-4xl md:text-5xl font-semibold leading-none text-white tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {testimonial.result.value}
            </div>
            <div className="text-xs md:text-sm text-white/65 mt-3 leading-relaxed">{testimonial.result.label}</div>
          </div>
        )}
      </div>
    </article>
  );
}

function CompactQuote({ testimonial }: { testimonial: Testimonial }) {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-400 p-7 md:p-9 h-full flex flex-col">
      <div
        className="text-4xl leading-none text-blue-400/40 mb-3"
        style={{ fontFamily: "var(--font-serif)" }}
        aria-hidden="true"
      >
        “
      </div>
      <p
        className="text-base md:text-[1.0625rem] leading-[1.85] text-white/85 flex-1"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {testimonial.quote}
      </p>
      <div className="mt-7 pt-5 border-t border-white/[0.06] flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/20 flex items-center justify-center text-xs font-bold text-white">
          {testimonial.author.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="text-[0.8125rem] font-semibold text-white truncate">
            {testimonial.author}
            <span className="ml-2 text-[0.6875rem] font-normal text-white/55">{testimonial.role}</span>
          </div>
          <div className="text-[0.6875rem] text-white/50 truncate mt-0.5">{testimonial.company}</div>
        </div>
        {testimonial.result && (
          <div className="ml-auto text-right">
            <div
              className="text-xl font-semibold text-blue-400 leading-none"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {testimonial.result.value}
            </div>
            <div className="text-[0.625rem] text-white/55 mt-1">{testimonial.result.label}</div>
          </div>
        )}
      </div>
    </article>
  );
}
