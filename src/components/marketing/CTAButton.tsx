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
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 text-[0.938rem] px-6 py-3.5 active:scale-[0.97]";

  const variants = {
    primary:
      "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-[0_1px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_2px_20px_rgba(59,130,246,0.45)] hover:-translate-y-[0.5px]",
    outline:
      "border border-white/20 text-white hover:bg-white/10 hover:border-white/30 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
    white:
      "bg-white text-[#1d1d1f] hover:bg-gray-50 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.1)] hover:-translate-y-[1px]",
    "white-outline":
      "border border-white/30 text-white hover:bg-white/10 backdrop-blur-sm",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
