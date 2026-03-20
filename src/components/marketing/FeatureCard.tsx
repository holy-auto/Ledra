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
      ? "bg-white/[0.04] backdrop-blur-sm rounded-2xl p-7 md:p-8 border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] hover:shadow-[0_0_32px_rgba(59,130,246,0.13)] hover:-translate-y-1.5 transition-all duration-400 group"
      : "bg-white/[0.03] backdrop-blur-sm rounded-2xl p-7 md:p-8 border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-[0_0_25px_rgba(59,130,246,0.1)] hover:-translate-y-1.5 transition-all duration-400 group";

  return (
    <ScrollReveal variant="fade-up" delay={delay}>
      <div className={cardClass}>
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-blue-400 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:from-blue-500/30 group-hover:to-blue-500/15 transition-all duration-400">
          {icon}
        </div>
        <h3 className="text-[1.125rem] md:text-[1.25rem] font-bold leading-[1.4] text-white mb-3">
          {title}
        </h3>
        <p className="text-[0.938rem] leading-[1.75] text-white/60">{description}</p>
      </div>
    </ScrollReveal>
  );
}
