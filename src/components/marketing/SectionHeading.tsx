import { ScrollReveal } from "./ScrollReveal";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  light = true,
  serif = false,
  size = "default",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  light?: boolean;
  serif?: boolean;
  size?: "default" | "lg";
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  const titleColor = light ? "text-white" : "text-heading";
  const subtitleColor = light ? "text-white/80" : "text-muted";
  const sizeClass = size === "lg" ? "text-[2rem] md:text-[3.25rem]" : "text-[1.75rem] md:text-[2.75rem]";
  const fontFamily = serif ? "font-[var(--font-serif)]" : "";
  const weight = serif ? "font-semibold" : "font-bold";

  return (
    <ScrollReveal variant="blur-in">
      <div className={`mb-14 md:mb-16 ${alignClass}`}>
        {eyebrow && (
          <div
            className={`mb-5 text-[0.6875rem] md:text-xs font-semibold tracking-[0.22em] uppercase text-blue-400 ${align === "center" ? "flex items-center justify-center gap-3" : "flex items-center gap-3"}`}
          >
            {align === "center" && <span className="block w-8 h-px bg-blue-400/60" aria-hidden="true" />}
            <span>{eyebrow}</span>
            <span className="block w-8 h-px bg-blue-400/60" aria-hidden="true" />
          </div>
        )}
        <h2 className={`${sizeClass} ${weight} leading-[1.2] tracking-tight ${titleColor} ${fontFamily}`.trim()}>
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mt-5 text-[0.938rem] md:text-base leading-relaxed ${subtitleColor} ${align === "center" ? "max-w-xl mx-auto" : ""}`}
          >
            {subtitle}
          </p>
        )}
      </div>
    </ScrollReveal>
  );
}
