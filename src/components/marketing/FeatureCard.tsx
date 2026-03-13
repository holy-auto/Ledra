"use client";

import { ScrollReveal } from "./ScrollReveal";

export function FeatureCard({
  icon,
  title,
  description,
  variant = "subtle",
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  variant?: "subtle" | "bordered";
  delay?: number;
}) {
  const cardClass =
    variant === "bordered"
      ? "bg-white rounded-2xl p-7 md:p-8 border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:border-black/[0.1] hover:-translate-y-1.5 transition-all duration-400 group"
      : "bg-white rounded-2xl p-7 md:p-8 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-400 group";

  return (
    <ScrollReveal variant="fade-up" delay={delay}>
      <div className={cardClass}>
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary flex items-center justify-center mb-5 group-hover:scale-110 group-hover:from-primary/20 group-hover:to-primary/10 transition-all duration-400">
          {icon}
        </div>
        <h3 className="text-[1.125rem] md:text-[1.25rem] font-bold leading-[1.4] text-heading mb-3">
          {title}
        </h3>
        <p className="text-[0.938rem] leading-[1.75] text-muted">{description}</p>
      </div>
    </ScrollReveal>
  );
}
