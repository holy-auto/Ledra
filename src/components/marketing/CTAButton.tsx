import Link from "next/link";

export function CTAButton({
  variant = "primary",
  href,
  children,
  className = "",
}: {
  variant?: "primary" | "outline" | "white" | "white-outline";
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 text-[0.938rem] px-8 py-3.5";

  const variants = {
    primary:
      "bg-primary text-white hover:bg-primary-hover shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(11,92,186,0.25)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_6px_20px_rgba(11,92,186,0.35)] hover:-translate-y-[1px]",
    outline:
      "border border-border text-heading bg-white hover:border-primary hover:text-primary hover:bg-primary-light/50 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
    white:
      "bg-white text-primary hover:bg-gray-50 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.1)] hover:-translate-y-[1px]",
    "white-outline":
      "border border-white/30 text-white hover:bg-white/10 backdrop-blur-sm",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
