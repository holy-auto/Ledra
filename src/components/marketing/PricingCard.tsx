import { CTAButton } from "./CTAButton";
import { ScrollReveal } from "./ScrollReveal";

export function PricingCard({
  name,
  price,
  unit = "月",
  description,
  features,
  recommended = false,
  ctaLabel = "お申し込み",
  ctaHref = "/signup",
  delay = 0,
}: {
  name: string;
  price: string;
  unit?: string;
  description: string;
  features: string[];
  recommended?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  delay?: number;
}) {
  const inner = (
    <div
      className={`rounded-2xl p-6 md:p-8 w-full relative flex flex-col transition-all duration-400 group h-full ${
        recommended
          ? "bg-[#0d1525]"
          : "bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] hover:border-white/[0.12] hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] hover:-translate-y-1"
      }`}
    >
      {recommended && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-violet-500 text-white text-xs font-medium px-4 py-1.5 rounded-full shadow-[0_2px_12px_rgba(59,130,246,0.5)]">
          おすすめ
        </div>
      )}

      <div className="mb-8">
        <h3 className="text-lg font-bold text-white">{name}</h3>
        <p className="mt-1.5 text-sm text-white/50">{description}</p>
      </div>

      <div className="mb-8 min-h-[3.5rem] flex items-baseline">
        <span className="text-[2.5rem] font-bold tracking-tight text-white">{price}</span>
        {unit && <span className="text-sm ml-1.5 text-white/40">{unit.startsWith("/") ? unit : `/${unit}`}</span>}
      </div>

      <ul className="space-y-3 mb-10 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug text-white/70">
            <div
              className="w-5 h-5 flex-shrink-0 mt-0.5 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(59,130,246,0.25) 0%, rgba(139,92,246,0.15) 100%)",
                boxShadow: "0 2px 8px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                transform: "perspective(400px) rotateX(5deg)",
              }}
            >
              <svg className="w-3 h-3 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            {feature}
          </li>
        ))}
      </ul>

      <CTAButton variant={recommended ? "white" : "outline"} href={ctaHref} className="w-full text-center">
        {ctaLabel}
      </CTAButton>
    </div>
  );

  return (
    <ScrollReveal variant="fade-up" delay={delay}>
      {recommended ? (
        <div className="gradient-border-recommended scale-[1.02] shadow-[0_0_50px_rgba(59,130,246,0.18)] h-full">
          {inner}
        </div>
      ) : (
        inner
      )}
    </ScrollReveal>
  );
}
