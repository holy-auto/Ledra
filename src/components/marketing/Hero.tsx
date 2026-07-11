import { Container } from "./Container";
import { CTAButton } from "./CTAButton";
import { HeroTypewriter } from "./HeroTypewriter";
import { ScreenshotFrame } from "./ScreenshotFrame";
import { Hero3DCertificate } from "./hero3d/Hero3DCertificate";

const TITLE_LINE_1 = ["現場の", "技術を、"];
const TITLE_LINE_2 = ["業界の", "力へ。"];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#060a12] min-h-[92vh] flex items-center">
      {/* Background: GPU-accelerated blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-600/20 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-400/15 rounded-full blur-[130px]" />
        <div
          className="absolute top-[40%] left-[50%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-[pulse-soft_8s_ease-in-out_infinite]"
          style={{ willChange: "opacity" }}
        />
        <div
          className="absolute top-[-5%] right-[10%] w-[400px] h-[400px] bg-violet-600/15 rounded-full blur-[130px] animate-[dark-float_14s_ease-in-out_infinite_1s]"
          style={{ willChange: "transform" }}
        />
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
      </div>

      <Container className="relative w-full py-20 md:py-24 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left: copy + CTAs */}
          <div className="lg:col-span-5 text-left">
            <div className="animate-[hero-fade-in_0.7s_ease-out_0.15s_both]">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[pulse-soft_2s_ease-in-out_infinite]" />
                WEB施工証明書SaaS
              </div>
            </div>

            <h1 className="mt-8">
              <span className="block text-[2.25rem] md:text-[3rem] lg:text-[3.5rem] xl:text-[4rem] font-bold leading-[1.1] tracking-tight text-white">
                {TITLE_LINE_1.map((phrase, i) => (
                  <span
                    key={`l1-${i}`}
                    className="inline-block"
                    style={{
                      animation: `hero-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + i * 0.14}s both`,
                    }}
                  >
                    {phrase}
                  </span>
                ))}
              </span>
              <span className="block mt-1 text-[2.25rem] md:text-[3rem] lg:text-[3.5rem] xl:text-[4rem] font-bold leading-[1.1] tracking-tight">
                {TITLE_LINE_2.map((phrase, i) => (
                  <span
                    key={`l2-${i}`}
                    className="inline-block bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent bg-[length:200%_auto]"
                    style={{
                      animation: `hero-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${0.6 + i * 0.14}s both`,
                    }}
                  >
                    {phrase}
                  </span>
                ))}
              </span>
            </h1>

            <p className="mt-7 text-base md:text-lg leading-relaxed text-white max-w-xl animate-[hero-fade-up_0.8s_ease-out_0.95s_both]">
              施工記録を、改ざん不可能なデジタル証明書に。Ledraは現場の技術を可視化し、施工店・代理店・保険会社をつなぐプラットフォームです。
            </p>

            <p className="mt-3 min-h-[1.6em] text-xs md:text-sm font-medium tracking-wide text-white animate-[hero-fade-in_0.6s_ease-out_1.05s_both]">
              <HeroTypewriter text="履歴に、嘘をつかせない。" startDelay={1200} speed={48} />
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-9 animate-[hero-fade-up_0.8s_ease-out_0.9s_both]">
              <CTAButton variant="white" href="/signup" trackLocation="hero">
                無料で試す
              </CTAButton>
              <CTAButton variant="white-outline" href="/resources" trackLocation="hero">
                資料ダウンロード
              </CTAButton>
              <CTAButton variant="white-outline" href="/demo" trackLocation="hero">
                デモを見る
              </CTAButton>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 animate-[hero-fade-in_0.8s_ease-out_1.2s_both]">
              <div className="text-left">
                <div className="text-xl md:text-2xl font-bold text-white">
                  無料<span className="text-blue-400">で開始</span>
                </div>
                <div className="text-xs text-white mt-0.5">クレジットカード不要</div>
              </div>
              <div className="hidden sm:block w-px h-7 bg-white/10" />
              <div className="text-left">
                <div className="text-xl md:text-2xl font-bold text-white">
                  5<span className="text-blue-400">分</span>
                </div>
                <div className="text-xs text-white mt-0.5">かんたん初期設定</div>
              </div>
              <div className="hidden sm:block w-px h-7 bg-white/10" />
              <div className="text-left">
                <div className="text-xl md:text-2xl font-bold text-white">
                  URL<span className="text-blue-400">共有</span>
                </div>
                <div className="text-xs text-white mt-0.5">証明書をすぐに共有</div>
              </div>
            </div>
          </div>

          {/* Right: product screenshot — container 右端を超えてはみ出させる */}
          <div className="lg:col-span-7 relative animate-[hero-fade-up_0.9s_ease-out_0.5s_both]">
            <div className="relative lg:-mr-[10vw] xl:-mr-[18vw]">
              {/* Decorative glow behind frame */}
              <div className="absolute -inset-6 bg-gradient-to-br from-blue-500/20 via-violet-500/10 to-transparent blur-2xl rounded-3xl pointer-events-none" />
              {/* 対応デバイスでは 3D「浮かぶ証明書」へクロスフェード。スクショが LCP を担う */}
              <Hero3DCertificate>
                <ScreenshotFrame
                  src="/marketing/screenshots/01-admin-dashboard.png"
                  alt="Ledra 管理ダッシュボード"
                  url="admin.ledra.app/dashboard"
                  priority
                  sizes="(min-width: 1024px) 65vw, 100vw"
                  className="relative"
                >
                  <HeroDashboardMock />
                </ScreenshotFrame>
              </Hero3DCertificate>

              {/* Floating sub-card */}
              <div className="hidden md:block absolute -bottom-6 -left-6 w-[44%] max-w-[260px] rounded-xl border border-white/[0.1] bg-[#0a0f1a]/95 backdrop-blur-md p-3 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-2 text-[0.65rem] text-white">
                  <span className="block w-2 h-2 rounded-full bg-emerald-400" />
                  改ざん検証 OK
                </div>
                <div className="mt-1.5 font-mono text-[0.65rem] text-white truncate">ledra.app/v/8a4f...c2e1</div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* Hero 専用ダッシュボードモック (画像未配置時のフォールバック) */
function HeroDashboardMock() {
  return (
    <div className="absolute inset-0 grid grid-cols-12">
      {/* Sidebar */}
      <aside className="col-span-3 hidden md:flex flex-col border-r border-white/[0.06] bg-white/[0.02] py-3 px-3">
        <div className="text-[0.55rem] font-bold uppercase tracking-widest text-white">Ledra</div>
        <ul className="mt-3 space-y-1 text-[0.625rem]">
          {[
            ["ダッシュボード", true],
            ["証明書", false],
            ["顧客台帳", false],
            ["車両", false],
            ["代理店", false],
            ["損保連携", false],
            ["設定", false],
          ].map(([label, active]) => (
            <li
              key={label as string}
              className={`rounded px-2 py-1 ${active ? "bg-blue-500/15 text-blue-200" : "text-white"}`}
            >
              {label}
            </li>
          ))}
        </ul>
      </aside>

      {/* Main */}
      <main className="col-span-12 md:col-span-9 p-3 md:p-4 flex flex-col gap-2.5">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "今月発行", value: "82", delta: "+12" },
            { label: "保険照会", value: "147", delta: "+24" },
            { label: "売上", value: "¥1.24M", delta: "+8.4%" },
            { label: "NPS", value: "4.8", delta: "/5.0" },
          ].map((k) => (
            <div key={k.label} className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="text-[0.5rem] uppercase tracking-wider text-white">{k.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-[0.85rem] font-bold text-white">{k.value}</span>
                <span className="text-[0.55rem] text-emerald-300">{k.delta}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="col-span-2 rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.6rem] font-bold text-white">月次発行推移</span>
              <span className="text-[0.5rem] text-white">Last 6 mo.</span>
            </div>
            <svg viewBox="0 0 320 100" className="mt-1.5 w-full h-[calc(100%-1rem)]">
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(96,165,250,0.5)" />
                  <stop offset="100%" stopColor="rgba(96,165,250,0)" />
                </linearGradient>
              </defs>
              <path d="M0,75 L60,60 L120,68 L180,45 L240,30 L320,15 L320,100 L0,100 Z" fill="url(#hero-area)" />
              <path
                d="M0,75 L60,60 L120,68 L180,45 L240,30 L320,15"
                fill="none"
                stroke="rgba(96,165,250,0.9)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="text-[0.6rem] font-bold text-white">最近の発行</div>
            <ul className="mt-2 space-y-1.5">
              {[
                { car: "ALPHARD", menu: "コーティング", t: "10:24" },
                { car: "PRIUS", menu: "PPF", t: "09:48" },
                { car: "N-BOX", menu: "ガラス", t: "昨日" },
              ].map((r) => (
                <li key={r.car} className="flex items-center justify-between text-[0.55rem]">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{r.car}</p>
                    <p className="text-white truncate">{r.menu}</p>
                  </div>
                  <span className="text-white ml-1">{r.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
