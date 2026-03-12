export function SectionHeading({
  title,
  subtitle,
  align = "center",
  light = false,
}: {
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  light?: boolean;
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  const titleColor = light ? "text-white" : "text-heading";
  const subtitleColor = light ? "text-white/70" : "text-muted";

  return (
    <div className={`mb-14 md:mb-16 ${alignClass}`}>
      <h2
        className={`text-[1.75rem] md:text-[2.5rem] font-bold leading-[1.25] tracking-tight ${titleColor}`}
      >
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
  );
}
