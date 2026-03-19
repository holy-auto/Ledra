import { Container } from "@/components/marketing/Container";
import { CountdownTimer } from "@/components/marketing/CountdownTimer";
import Link from "next/link";

export default function HomePage() {
  return (
    <section className="relative overflow-hidden bg-[#060a12] min-h-[92vh] flex items-center">
      {/* Background effects */}
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
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%)",
          }}
        />
      </div>

      <Container className="relative text-center py-28 md:py-40">
        {/* Badge */}
        <div className="animate-[hero-fade-in_0.7s_ease-out_0.15s_both]">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[pulse-soft_2s_ease-in-out_infinite]" />
            2026.04.01 Launch
          </div>
        </div>

        {/* Title */}
        <h1 className="mt-10">
          <span className="block text-[2.5rem] md:text-[3.75rem] lg:text-[4.5rem] font-bold leading-[1.1] tracking-tight text-white animate-[hero-fade-up_0.8s_ease-out_0.3s_both]">
            施工証明をデジタルで。
          </span>
          <span className="block mt-2 text-[2.5rem] md:text-[3.75rem] lg:text-[4.5rem] font-bold leading-[1.1] tracking-tight bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent animate-[hero-fade-up_0.8s_ease-out_0.5s_both] bg-[length:200%_auto]">
            信頼を、かんたんに。
          </span>
        </h1>

        <p className="mt-8 text-lg md:text-xl leading-relaxed text-white/50 max-w-2xl mx-auto animate-[hero-fade-up_0.8s_ease-out_0.7s_both]">
          CARTRUSTは、自動車の施工記録をデジタル証明書として発行・管理できるプラットフォームです。
          <br className="hidden md:block" />
          サービス公開までもう少しお待ちください。
        </p>

        {/* Countdown */}
        <div className="mt-16 animate-[hero-fade-up_0.8s_ease-out_0.9s_both]">
          <CountdownTimer />
        </div>

        {/* CTA */}
        <div className="mt-16 flex flex-col sm:flex-row gap-4 justify-center animate-[hero-fade-up_0.8s_ease-out_1.1s_both]">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-8 py-4 bg-white text-[#060a12] hover:bg-gray-100 transition-colors shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            事前お問い合わせ
          </Link>
        </div>

        {/* Sub text */}
        <p className="mt-8 text-sm text-white/30 animate-[hero-fade-in_0.8s_ease-out_1.3s_both]">
          ローンチ後すぐにご利用いただけるよう、事前のお問い合わせを受け付けています
        </p>
      </Container>
    </section>
  );
}
