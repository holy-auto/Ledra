import { Container } from "./Container";
import { Badge } from "./Badge";
import { CTAButton } from "./CTAButton";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#070b14] min-h-[92vh] flex items-center">
      {/* Dark premium background with animated elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large animated gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-primary/20 rounded-full blur-[150px] animate-[float_10s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#4f9cf7]/15 rounded-full blur-[130px] animate-[float_12s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[40%] left-[50%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-[pulse-soft_8s_ease-in-out_infinite]" />

        {/* Refined grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(79,156,247,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(79,156,247,0.3) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%)",
          }}
        />

        {/* Horizontal light streaks */}
        <div className="absolute top-[30%] left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent animate-[shimmer_5s_ease-in-out_infinite]" />
        <div className="absolute top-[70%] left-0 w-full h-px bg-gradient-to-r from-transparent via-[#4f9cf7]/10 to-transparent animate-[shimmer_7s_ease-in-out_infinite_reverse]" />

        {/* Floating particles */}
        <div className="absolute top-[12%] right-[18%] w-1.5 h-1.5 bg-primary/40 rounded-full animate-[float_5s_ease-in-out_infinite]" />
        <div className="absolute top-[60%] left-[15%] w-1 h-1 bg-[#4f9cf7]/30 rounded-full animate-[float_7s_ease-in-out_infinite_1s]" />
        <div className="absolute top-[25%] left-[10%] w-2 h-2 border border-primary/15 rounded-full animate-[float_9s_ease-in-out_infinite_2s]" />
        <div className="absolute top-[45%] right-[8%] w-1.5 h-1.5 border border-[#4f9cf7]/15 rounded-sm rotate-45 animate-[float_8s_ease-in-out_infinite_0.5s]" />
        <div className="absolute top-[80%] right-[25%] w-1 h-1 bg-primary/25 rounded-full animate-[float_6s_ease-in-out_infinite_3s]" />

        {/* Bottom gradient fade to white */}
        <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-white to-transparent" />
      </div>

      <Container className="relative text-center py-28 md:py-40 lg:py-48">
        <div className="animate-[hero-fade-in_0.7s_ease-out_0.15s_both]">
          <Badge>WEB施工証明書SaaS</Badge>
        </div>

        <h1 className="mt-10">
          <span className="block text-[2.5rem] md:text-[3.75rem] lg:text-[4.5rem] font-bold leading-[1.1] tracking-tight text-white animate-[hero-fade-up_0.8s_ease-out_0.3s_both]">
            施工証明をデジタルで。
          </span>
          <span className="block mt-2 text-[2.5rem] md:text-[3.75rem] lg:text-[4.5rem] font-bold leading-[1.1] tracking-tight bg-gradient-to-r from-[#60a5fa] via-[#93c5fd] to-[#60a5fa] bg-clip-text text-transparent animate-[hero-fade-up_0.8s_ease-out_0.5s_both] bg-[length:200%_auto] animate-[hero-fade-up_0.8s_ease-out_0.5s_both]">
            信頼を、かんたんに。
          </span>
        </h1>

        <p className="mt-10 text-lg md:text-xl leading-relaxed text-white/50 max-w-2xl mx-auto animate-[hero-fade-up_0.8s_ease-out_0.7s_both]">
          CARTRUSTは、自動車の施工記録をデジタル証明書として発行・管理できるプラットフォームです。
          施工店の業務効率化と、保険会社の査定精度向上を同時に実現します。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12 animate-[hero-fade-up_0.8s_ease-out_0.9s_both]">
          <CTAButton variant="white" href="/contact">
            無料で始める
          </CTAButton>
          <CTAButton variant="white-outline" href="/contact">
            資料請求
          </CTAButton>
        </div>

        {/* Trust metrics */}
        <div className="mt-20 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 animate-[hero-fade-in_0.8s_ease-out_1.2s_both]">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">500<span className="text-primary-light">+</span></div>
            <div className="text-xs text-white/40 mt-1">導入企業数</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">10,000<span className="text-primary-light">+</span></div>
            <div className="text-xs text-white/40 mt-1">証明書発行数</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">99<span className="text-primary-light">%</span></div>
            <div className="text-xs text-white/40 mt-1">継続利用率</div>
          </div>
        </div>
      </Container>
    </section>
  );
}
