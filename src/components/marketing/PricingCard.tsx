import { CTAButton } from "./CTAButton";

export function PricingCard({
  name,
  price,
  unit = "月",
  description,
  features,
  recommended = false,
  ctaLabel = "お申し込み",
  ctaHref = "/contact",
}: {
  name: string;
  price: string;
  unit?: string;
  description: string;
  features: string[];
  recommended?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-8 md:p-10 w-full relative flex flex-col transition-all duration-300 ${
        recommended
          ? "bg-heading text-white shadow-[0_4px_24px_rgba(17,24,39,0.15)] scale-[1.02]"
          : "bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
      }`}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-medium px-4 py-1.5 rounded-full shadow-sm">
          おすすめ
        </div>
      )}

      <div className="mb-8">
        <h3 className={`text-lg font-bold ${recommended ? "text-white" : "text-heading"}`}>
          {name}
        </h3>
        <p className={`mt-1.5 text-sm ${recommended ? "text-white/60" : "text-muted"}`}>
          {description}
        </p>
      </div>

      <div className="mb-8">
        <span className={`text-[2.75rem] font-bold tracking-tight ${recommended ? "text-white" : "text-heading"}`}>
          {price}
        </span>
        {unit && (
          <span className={`text-sm ml-1.5 ${recommended ? "text-white/50" : "text-muted"}`}>
            /{unit}
          </span>
        )}
      </div>

      <ul className="space-y-3.5 mb-10 flex-1">
        {features.map((feature) => (
          <li
            key={feature}
            className={`flex items-start gap-2.5 text-sm ${recommended ? "text-white/80" : "text-body"}`}
          >
            <svg
              className={`w-4.5 h-4.5 flex-shrink-0 mt-0.5 ${recommended ? "text-primary-light" : "text-primary"}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      <CTAButton
        variant={recommended ? "white" : "outline"}
        href={ctaHref}
        className="w-full text-center"
      >
        {ctaLabel}
      </CTAButton>
    </div>
  );
}
