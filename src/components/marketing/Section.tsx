import { Container } from "./Container";

export function Section({
  bg = "white",
  children,
  className = "",
}: {
  bg?: "white" | "alt" | "primary" | "dark" | "dark-alt";
  children: React.ReactNode;
  className?: string;
}) {
  const bgClass =
    bg === "alt" || bg === "dark-alt"
      ? "bg-[#0a0f1a]"
      : bg === "primary"
        ? "bg-gradient-to-br from-primary to-[#094A96]"
        : "bg-[#060a12]";

  const isDark = true;

  return (
    <section className={`relative py-24 md:py-32 overflow-hidden ${bgClass} ${className}`}>
      {isDark && (
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse 90% 70% at 50% 50%, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 50%, black 30%, transparent 80%)",
          }}
        />
      )}
      <Container className="relative">{children}</Container>
    </section>
  );
}
