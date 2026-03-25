import { Container } from "./Container";

export function PageHero({
  badge,
  title,
  subtitle,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-[var(--mk-bg-hero)] flex items-center">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-30%] left-[-10%] w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[120px] animate-[float_10s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-20%] right-[-5%] w-[400px] h-[400px] bg-[var(--mk-accent-light-blue)]/10 rounded-full blur-[100px] animate-[float_12s_ease-in-out_infinite_reverse]" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(79,156,247,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(79,156,247,0.3) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%)",
          }}
        />

        {/* Light streaks */}
        <div className="absolute top-[40%] left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-600/15 to-transparent animate-[shimmer_5s_ease-in-out_infinite]" />

        {/* Particles */}
        <div className="absolute top-[20%] right-[15%] w-1.5 h-1.5 bg-blue-600/30 rounded-full animate-[float_6s_ease-in-out_infinite]" />
        <div className="absolute top-[60%] left-[12%] w-1 h-1 bg-[var(--mk-accent-light-blue)]/25 rounded-full animate-[float_8s_ease-in-out_infinite_1s]" />

        {/* Bottom gradient fade to dark */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[var(--mk-bg-base)] to-transparent" />
      </div>

      <Container className="relative text-center py-20 md:py-28 lg:py-32">
        {badge && (
          <div className="animate-[hero-fade-in_0.6s_ease-out_0.1s_both]">
            <span className="inline-block text-xs font-medium tracking-wider uppercase text-blue-300 bg-white/[0.06] border border-white/[0.08] px-4 py-1.5 rounded-full">
              {badge}
            </span>
          </div>
        )}

        <h1 className="mt-6 text-[2rem] md:text-[3rem] lg:text-[3.5rem] font-bold leading-[1.15] tracking-tight text-white animate-[hero-fade-up_0.7s_ease-out_0.2s_both]">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-6 text-base md:text-lg leading-relaxed text-white/65 max-w-2xl mx-auto animate-[hero-fade-up_0.7s_ease-out_0.4s_both]">
            {subtitle}
          </p>
        )}
      </Container>
    </section>
  );
}
