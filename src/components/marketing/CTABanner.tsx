"use client";

import { Container } from "./Container";
import { CTAButton } from "./CTAButton";
import { ScrollReveal } from "./ScrollReveal";

export function CTABanner({
  title = "Ledraを始めましょう",
  subtitle = "まずはお気軽にお問い合わせください。導入のご相談も承ります。",
  primaryLabel = "プランを見る",
  primaryHref = "/pricing",
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
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0f1a] via-[#1e293b] to-[#0a0f1a]">
      {/* Animated decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] animate-[float_10s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-blue-600/5 rounded-full blur-[80px] animate-[float_8s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/[0.03] rounded-full blur-[120px] animate-[pulse-soft_6s_ease-in-out_infinite]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          }}
        />
      </div>

      <Container className="relative text-center py-24 md:py-32">
        <ScrollReveal variant="blur-in">
          <h2 className="text-[1.75rem] md:text-[2.5rem] font-bold leading-[1.25] tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-5 text-base text-white/60 max-w-lg mx-auto">{subtitle}</p>
        </ScrollReveal>
        <ScrollReveal variant="fade-up" delay={200}>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <CTAButton variant="white" href={primaryHref}>
              {primaryLabel}
            </CTAButton>
            <CTAButton variant="white-outline" href={secondaryHref}>
              {secondaryLabel}
            </CTAButton>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
