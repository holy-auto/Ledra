import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * DashboardMockSection — 管理画面 (admin) のスクリーンショット代替モック。
 *
 * 実画面のスクショ差し替え予定。現段階では SVG / Tailwind のみで構成し、
 * デザイン更新に追従できるように LP コンポーネントとして表現する。
 */

export function DashboardMockSection() {
  return (
    <Section id="dashboard">
      <SectionHeading
        title="現場のデータが、経営の言葉になる。"
        subtitle="管理画面では、施工件数・売上・代理店成績・保険会社照会数を、店舗別・期間別に把握できます。"
      />

      <ScrollReveal variant="fade-up">
        <div className="mx-auto max-w-5xl rounded-2xl border border-white/[0.1] bg-gradient-to-br from-[#0a0f1a] to-[#0b111c] shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="block w-2.5 h-2.5 rounded-full bg-rose-400/40" />
            <span className="block w-2.5 h-2.5 rounded-full bg-amber-400/40" />
            <span className="block w-2.5 h-2.5 rounded-full bg-emerald-400/40" />
            <span className="ml-3 text-[0.65rem] text-white/70 font-mono">admin.ledra.app / dashboard</span>
          </div>

          <div className="grid grid-cols-12 gap-0">
            {/* sidebar */}
            <aside className="col-span-3 hidden md:block border-r border-white/[0.06] bg-white/[0.02] py-5 px-4">
              <div className="text-[0.65rem] font-medium uppercase tracking-widest text-white/80">Ledra Admin</div>
              <ul className="mt-5 space-y-1.5 text-xs text-white/80">
                {[
                  ["ダッシュボード", true],
                  ["証明書", false],
                  ["顧客台帳", false],
                  ["車両", false],
                  ["請求", false],
                  ["代理店", false],
                  ["損保連携", false],
                  ["設定", false],
                ].map(([label, active]) => (
                  <li
                    key={label as string}
                    className={`rounded-md px-3 py-2 ${
                      active ? "bg-blue-500/15 text-blue-200" : "text-white/80 hover:text-white"
                    }`}
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </aside>

            {/* main */}
            <main className="col-span-12 md:col-span-9 p-5 md:p-7">
              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "今月発行", value: "82", delta: "+12" },
                  { label: "保険会社照会", value: "147", delta: "+24" },
                  { label: "今月売上", value: "¥1.24M", delta: "+8.4%" },
                  { label: "顧客満足度", value: "4.8", delta: "/ 5.0" },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="text-[0.625rem] uppercase tracking-wider text-white/80">{k.label}</div>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-white">{k.value}</span>
                      <span className="text-[0.65rem] text-emerald-300">{k.delta}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* chart + list */}
              <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* chart */}
                <div className="lg:col-span-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white">月次発行推移</h4>
                    <span className="text-[0.6rem] text-white/70">Last 6 mo.</span>
                  </div>
                  <svg viewBox="0 0 320 120" className="mt-3 w-full">
                    <defs>
                      <linearGradient id="dm-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(96,165,250,0.5)" />
                        <stop offset="100%" stopColor="rgba(96,165,250,0)" />
                      </linearGradient>
                    </defs>
                    {/* gridlines */}
                    {[0, 30, 60, 90].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        x2="320"
                        y1={y + 10}
                        y2={y + 10}
                        stroke="rgba(255,255,255,0.05)"
                        strokeDasharray="2 4"
                      />
                    ))}
                    {/* area */}
                    <path d="M0,90 L60,72 L120,80 L180,55 L240,40 L320,22 L320,120 L0,120 Z" fill="url(#dm-area)" />
                    {/* line */}
                    <path
                      d="M0,90 L60,72 L120,80 L180,55 L240,40 L320,22"
                      fill="none"
                      stroke="rgba(96,165,250,0.9)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    {/* dots */}
                    {[
                      [0, 90],
                      [60, 72],
                      [120, 80],
                      [180, 55],
                      [240, 40],
                      [320, 22],
                    ].map(([x, y]) => (
                      <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#60a5fa" />
                    ))}
                  </svg>
                </div>
                {/* recent list */}
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <h4 className="text-xs font-bold text-white">最近の発行</h4>
                  <ul className="mt-3 space-y-3">
                    {[
                      { car: "ALPHARD", menu: "ボディコーティング", time: "10:24" },
                      { car: "PRIUS", menu: "PPF (前面)", time: "09:48" },
                      { car: "N-BOX", menu: "ガラスコーティング", time: "昨日" },
                    ].map((r) => (
                      <li key={`${r.car}-${r.time}`} className="flex items-center justify-between text-[0.7rem]">
                        <div>
                          <p className="text-white font-medium">{r.car}</p>
                          <p className="text-white/80">{r.menu}</p>
                        </div>
                        <span className="text-white/80">{r.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* stripes legend */}
              <div className="mt-5 flex flex-wrap items-center gap-4 text-[0.6rem]">
                <span className="inline-flex items-center gap-1.5 text-white/85">
                  <span className="block w-2 h-2 rounded-sm bg-blue-400" />
                  <span>Cert 発行</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-white/85">
                  <span className="block w-2 h-2 rounded-sm bg-violet-400" />
                  <span>保険照会</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-white/85">
                  <span className="block w-2 h-2 rounded-sm bg-emerald-400" />
                  <span>顧客 NPS</span>
                </span>
              </div>
            </main>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal variant="fade-in" delay={150}>
        <p className="mt-6 text-center text-xs text-white/70">
          ※ デモ用のモック画面です。実際の指標・粒度は plan によって異なります。
        </p>
      </ScrollReveal>
    </Section>
  );
}
