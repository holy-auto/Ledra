import { ScrollReveal } from "./ScrollReveal";

export function SectionHeading({
  title,
  subtitle,
  align = "center",
  light = true,
}: {
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  light?: boolean;
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  const titleColor = light ? "text-white" : "text-heading";
  const subtitleColor = light ? "text-white/50" : "text-muted";

  return (
    <ScrollReveal variant="blur-in">
      <div className={`mb-14 md:mb-16 ${alignClass}`}>
        <h2 className={`text-[1.75rem] md:text-[2.75rem] font-bold leading-[1.2] tracking-tight ${titleColor}`}>
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
