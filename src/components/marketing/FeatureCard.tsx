"use client";

import { ScrollReveal } from "./ScrollReveal";

export function FeatureCard({
  icon,
  title,
  description,
  variant = "subtle",
  size = "default",
  delay = 0,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  variant?: "subtle" | "bordered";
  size?: "default" | "compact";
  delay?: number;
}) {
  const isCompact = size === "compact";

  const cardClass =
    variant === "bordered"
      ? `bg-white/[0.04] backdrop-blur-sm rounded-2xl ${isCompact ? "p-5" : "p-7 md:p-8"} border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] hover:shadow-[0_0_32px_rgba(59,130,246,0.13)] hover:-translate-y-1.5 transition-all duration-400 group h-full`
      : `bg-white/[0.03] backdrop-blur-sm rounded-2xl ${isCompact ? "p-5" : "p-7 md:p-8"} border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-[0_0_25px_rgba(59,130,246,0.1)] hover:-translate-y-1.5 transition-all duration-400 group h-full`;

  return (
    <ScrollReveal variant="fade-up" delay={delay}>
      <div className={cardClass}>
        {icon && (
          <div className={`${isCompact ? "w-9 h-9 rounded-lg mb-4" : "w-11 h-11 rounded-xl mb-5"} bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 group-hover:from-blue-500/30 group-hover:to-blue-500/15 transition-all duration-400`}>
            {icon}
          </div>
        )}
        <h3 className={`${isCompact ? "text-sm" : "text-[1.125rem] md:text-[1.25rem]"} font-bold leading-[1.4] text-white ${isCompact ? "mb-2" : "mb-3"}`}>
          {title}
        </h3>
        <p className={`${isCompact ? "text-xs" : "text-[0.938rem]"} leading-relaxed text-white/65`}>{description}</p>
      </div>
    </ScrollReveal>
  );
}
