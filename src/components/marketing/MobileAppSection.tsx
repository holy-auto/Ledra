import { Section } from "./Section";
import { ScrollReveal } from "./ScrollReveal";

const POINTS = [
  {
    title: "撮影から発行まで、片手で完結",
    desc: "タブレット・スマホ前提のUI。撮影→証明書紐付け→発行を、作業の手を止めずに。",
  },
  {
    title: "Tap to Pay（iPhone）対応",
    desc: "iPhone をそのままカードリーダーに。追加機材なしで、現場決済が可能です。",
  },
  {
    title: "PWA でオフラインも強い",
    desc: "ホーム画面に追加するとアプリのように起動。通信が不安定な場所でも使える設計。",
  },
];

/**
 * Mobile appeal section.
 *
 * Illustration box is intentionally abstract — swap in real screenshots
 * once the demo tenant is ready (Phase 5).
 */
export function MobileAppSection() {
  return (
    <Section id="mobile">
      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Copy */}
        <ScrollReveal variant="fade-right">
          <div>
            <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.688rem] font-medium text-blue-300 uppercase tracking-wider">
              MOBILE
            </span>
            <h2 className="mt-6 text-[1.75rem] md:text-[2.5rem] font-bold leading-[1.2] tracking-tight text-white">
              現場のスマホで、<br />
              現場の速度で。
            </h2>
            <p className="mt-5 text-[0.938rem] md:text-base leading-[1.85] text-white/80">
              Ledra の中核機能は、モバイルブラウザから直接操作できます。PCを開かなくても、撮影から証明書発行、その場決済まで、現場で完結します。
            </p>
            <ul className="mt-8 space-y-5">
              {POINTS.map((p) => (
                <li key={p.title} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-500/10 border border-blue-500/20">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-300">
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{p.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/80">{p.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </ScrollReveal>

        {/* Illustration */}
        <ScrollReveal variant="fade-left" delay={120}>
          <div className="relative aspect-[4/5] md:aspect-[3/4] max-w-sm mx-auto">
            <div className="absolute inset-0 rounded-[2.5rem] border border-white/[0.12] bg-gradient-to-br from-[#0a0f1a] to-[#0b111c] shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden">
              {/* Decorative ambient glow */}
              <div className="absolute top-[-20%] right-[-20%] w-[320px] h-[320px] bg-blue-500/20 rounded-full blur-[80px]" />
              <div className="absolute bottom-[-20%] left-[-10%] w-[260px] h-[260px] bg-violet-500/15 rounded-full blur-[70px]" />

              {/* Notch */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[80px] h-5 rounded-full bg-black/60" />

              {/* Mock UI content */}
              <div className="relative h-full flex flex-col px-5 pt-12 pb-6">
                {/* Status row */}
                <div className="flex items-center justify-between text-[0.65rem] text-white/75 mb-6">
                  <span>10:24</span>
                  <span className="flex items-center gap-1">
                    <span className="block w-3 h-1 bg-white/30 rounded-sm" />
                    <span className="block w-3 h-3 border border-white/30 rounded" />
                  </span>
                </div>

                {/* "Card" */}
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4 backdrop-blur-md">
                  <p className="text-[0.625rem] uppercase tracking-wider text-blue-300/80">
                    今日の作業
                  </p>
                  <p className="mt-2 text-sm font-bold text-white leading-snug">
                    ガラスコーティング<br />施工完了
                  </p>
                  <div className="mt-3 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-blue-500 to-violet-500" />
                  </div>
                  <p className="mt-2 text-[0.65rem] text-white/80">3 / 4 ステップ完了</p>
                </div>

                {/* Action button */}
                <button className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 shadow-[0_1px_12px_rgba(59,130,246,0.3)]" type="button" disabled>
                  証明書を発行
                </button>

                {/* Dotted list */}
                <div className="mt-6 space-y-3">
                  {[
                    { icon: "📸", text: "施工写真 6 枚を紐付け" },
                    { icon: "🏷️", text: "メニュー: ガラスコーティング" },
                    { icon: "🚗", text: "車両: TOYOTA プリウス" },
                  ].map((r) => (
                    <div
                      key={r.text}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                    >
                      <span className="text-sm">{r.icon}</span>
                      <span className="text-[0.7rem] text-white/80">{r.text}</span>
                    </div>
                  ))}
                </div>

                {/* Payment hint */}
                <div className="mt-auto rounded-xl border border-blue-500/25 bg-blue-500/[0.08] p-3 text-center">
                  <p className="text-[0.65rem] text-blue-200/80">この端末で Tap to Pay</p>
                  <p className="mt-0.5 text-xs font-semibold text-white">そのまま決済に進めます</p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </Section>
  );
}
