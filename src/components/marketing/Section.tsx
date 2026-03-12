import { Container } from "./Container";

export function Section({
  bg = "white",
  children,
  className = "",
}: {
  bg?: "white" | "alt" | "primary";
  children: React.ReactNode;
  className?: string;
}) {
  const bgClass =
    bg === "alt"
      ? "bg-[#f8f9fb]"
      : bg === "primary"
        ? "bg-gradient-to-br from-primary to-[#094A96]"
        : "bg-white";

  return (
    <section className={`py-24 md:py-32 ${bgClass} ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}
