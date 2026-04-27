import { ScrollReveal } from "./ScrollReveal";

type Reason = {
  number: string;
  label: string;
  title: string;
  description: string;
  highlight: string;
  highlightLabel: string;
};

const REASONS: Reason[] = [
  {
    number: "01",
    label: "Reliability",
    title: "改ざんを許さない、デジタル証明の設計思想。",
    description:
      "発行された証明書は、内容のハッシュ署名と発行履歴で真正性を担保。施工店・顧客・保険会社の三者が、同じ事実を見つめられる仕組みを採用しています。",
    highlight: "100%",
    highlightLabel: "発行内容の真正性担保",
  },
  {
    number: "02",
    label: "Speed",
    title: "現場で完結する、最短5分の発行体験。",
    description:
      "テンプレートと自動入力補助により、スマートフォンでも数分で発行が完了。電話・FAX・紙のやり取りを排し、現場の集中を妨げません。",
    highlight: "5分",
    highlightLabel: "施工完了から共有まで",
  },
  {
    number: "03",
    label: "Network",
    title: "施工店・保険会社・顧客を、一つの記録でつなぐ。",
    description:
      "LedraはCert・Connect・Hub・Standard・Academyの5つのプロダクトで構成され、業界の関係者が同じ言語で対話できる共通基盤を提供します。",
    highlight: "5層",
    highlightLabel: "業界横断のエコシステム",
  },
];

export function SelectedReasons() {
  return (
    <div className="space-y-8 md:space-y-10">
      {REASONS.map((reason, i) => (
        <ScrollReveal key={reason.number} variant="fade-up" delay={i * 120}>
          <article className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 items-start rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-500 p-8 md:p-12">
            <div className="md:col-span-3 flex md:flex-col items-baseline md:items-start gap-4 md:gap-3">
              <div
                className="text-[3.5rem] md:text-[5rem] font-semibold leading-none text-white tracking-tight"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {reason.number}
              </div>
              <div className="text-[0.6875rem] font-semibold tracking-[0.24em] uppercase text-blue-400 mb-1">
                {reason.label}
              </div>
            </div>
            <div className="md:col-span-6">
              <h3
                className="text-[1.375rem] md:text-[1.75rem] font-semibold leading-[1.45] text-white tracking-tight"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {reason.title}
              </h3>
              <p className="mt-5 text-[0.938rem] md:text-base leading-[1.85] text-white/75">{reason.description}</p>
            </div>
            <div className="md:col-span-3 md:border-l md:border-white/[0.08] md:pl-8 flex md:flex-col gap-4 md:gap-2 items-baseline md:items-start border-t md:border-t-0 border-white/[0.08] pt-6 md:pt-0">
              <div
                className="text-3xl md:text-4xl font-semibold text-blue-400 leading-none tracking-tight"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {reason.highlight}
              </div>
              <div className="text-xs md:text-[0.8125rem] text-white/60 leading-relaxed">{reason.highlightLabel}</div>
            </div>
          </article>
        </ScrollReveal>
      ))}
    </div>
  );
}
