import { Container } from "./Container";
import { CTAButton } from "./CTAButton";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#060a12] min-h-[92vh] flex items-center">
      {/* Dark premium background with animated elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-600/20 rounded-full blur-[150px] animate-[float_10s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-400/15 rounded-full blur-[130px] animate-[float_12s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[40%] left-[50%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-[pulse-soft_8s_ease-in-out_infinite]" />
        <div className="absolute top-[-5%] right-[10%] w-[400px] h-[400px] bg-violet-600/15 rounded-full blur-[130px] animate-[float_14s_ease-in-out_infinite_1s]" />

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

        <div className="absolute top-[30%] left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent animate-[shimmer_5s_ease-in-out_infinite]" />
        <div className="absolute top-[70%] left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-400/10 to-transparent animate-[shimmer_7s_ease-in-out_infinite_reverse]" />

        <div className="absolute top-[12%] right-[18%] w-1.5 h-1.5 bg-blue-400/40 rounded-full animate-[float_5s_ease-in-out_infinite]" />
        <div className="absolute top-[60%] left-[15%] w-1 h-1 bg-blue-300/30 rounded-full animate-[float_7s_ease-in-out_infinite_1s]" />
        <div className="absolute top-[25%] left-[10%] w-2 h-2 border border-blue-400/15 rounded-full animate-[float_9s_ease-in-out_infinite_2s]" />
        <div className="absolute top-[45%] right-[8%] w-1.5 h-1.5 border border-violet-400/15 rounded-sm rotate-45 animate-[float_8s_ease-in-out_infinite_0.5s]" />
        <div className="absolute top-[80%] right-[25%] w-1 h-1 bg-blue-400/25 rounded-full animate-[float_6s_ease-in-out_infinite_3s]" />
        <div className="absolute top-[35%] right-[30%] w-1 h-1 bg-violet-400/20 rounded-full animate-[float_11s_ease-in-out_infinite_1.5s]" />
      </div>

      <Container className="relative text-center py-28 md:py-40 lg:py-48">
        <div className="animate-[hero-fade-in_0.7s_ease-out_0.15s_both]">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[pulse-soft_2s_ease-in-out_infinite]" />
            施工証明プラットフォーム
          </div>
        </div>

        <h1 className="mt-10">
          <span className="block text-[2.5rem] md:text-[3.75rem] lg:text-[4.5rem] font-bold leading-[1.1] tracking-tight text-white animate-[hero-fade-up_0.8s_ease-out_0.3s_both]">
            現場の技術を、
          </span>
          <span className="block mt-2 text-[2.5rem] md:text-[3.75rem] lg:text-[4.5rem] font-bold leading-[1.1] tracking-tight bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent animate-[hero-fade-up_0.8s_ease-out_0.5s_both] bg-[length:200%_auto]">
            業界の力へ。
          </span>
        </h1>

        <p className="mt-10 text-lg md:text-xl leading-relaxed text-white/50 max-w-2xl mx-auto animate-[hero-fade-up_0.8s_ease-out_0.7s_both]">
          Ledraは、施工証明・履歴管理・加盟店連携・技術育成を通じて、
          <br className="hidden md:block" />
          現場の技術を可視化し、業界全体に信頼と価値を届けるプラットフォームです。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12 animate-[hero-fade-up_0.8s_ease-out_0.9s_both]">
          <CTAButton variant="white" href="/pricing">
            プランを見る
          </CTAButton>
          <CTAButton variant="white-outline" href="/contact">
            Ledraを知る
          </CTAButton>
        </div>

        <div className="mt-20 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 animate-[hero-fade-in_0.8s_ease-out_1.2s_both]">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">
              無料<span className="text-blue-400">で開始</span>
            </div>
            <div className="text-xs text-white/40 mt-1">クレジットカード不要</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">
              5<span className="text-blue-400">分</span>
            </div>
            <div className="text-xs text-white/40 mt-1">かんたん初期設定</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-white">
              URL<span className="text-blue-400">共有</span>
            </div>
            <div className="text-xs text-white/40 mt-1">証明書をすぐに共有</div>
          </div>
        </div>
      </Container>
    </section>
  );
}
