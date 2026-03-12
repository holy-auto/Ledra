import { Container } from "./Container";
import { CTAButton } from "./CTAButton";

export function CTABanner({
  title = "CARTRUSTを始めましょう",
  subtitle = "まずはお気軽にお問い合わせください。導入のご相談も承ります。",
  primaryLabel = "無料で始める",
  primaryHref = "/contact",
  secondaryLabel = "お問い合わせ",
  secondaryHref = "/contact",
}: {
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-heading via-[#1e293b] to-heading">
      {/* Decorative */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Container className="relative text-center py-24 md:py-32">
        <h2 className="text-[1.75rem] md:text-[2.5rem] font-bold leading-[1.25] tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-5 text-base text-white/60 max-w-lg mx-auto">
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <CTAButton variant="white" href={primaryHref}>
            {primaryLabel}
          </CTAButton>
          <CTAButton variant="white-outline" href={secondaryHref}>
            {secondaryLabel}
          </CTAButton>
        </div>
      </Container>
    </section>
  );
}
