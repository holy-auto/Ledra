import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { BRAND_ACCENT } from "@/lib/marketing/brandAccentColors";

/**
 * 「1台の車の一生」スクロールテリング。
 *
 * 施工 → 証明書発行 → 保険査定 → 中古車売買、と1台の車についた記録が
 * 引き継がれていく様子を、スクロールに連動して見せる。
 *
 * 実装は CSS Scroll-Driven Animations（animation-timeline: view()）のみ。
 * クライアント JS・新規依存ゼロ。対応クラスは globals.css の
 * .car-journey-stage / .car-journey-line にあり、@supports の外側では
 * 常に完全表示の静的な状態（opacity:1）にフォールバックする。
 */

const STAGES = [
  {
    n: "01",
    title: "施工",
    body: "コーティング・PPF・板金——現場で技術が車に刻まれる瞬間。",
    color: BRAND_ACCENT.blue,
  },
  {
    n: "02",
    title: "証明書発行",
    body: "施工内容・写真・日時をまとめ、改ざんできない証明書として記録する。",
    color: BRAND_ACCENT.violet,
  },
  {
    n: "03",
    title: "保険査定",
    body: "保険会社がURLでそのまま照会。証明された履歴が、査定の根拠になる。",
    color: BRAND_ACCENT.emerald,
  },
  {
    n: "04",
    title: "中古車売買",
    body: "次のオーナーにも記録は途切れない。施工の価値が、車の価値として引き継がれる。",
    color: BRAND_ACCENT.gold,
  },
] as const;

export function CarJourneySection() {
  return (
    <Section id="car-journey">
      <SectionHeading
        title="1台の車の一生を、記録でつなぐ。"
        subtitle="施工店で生まれた記録が、途切れずに次の場面へ引き継がれていきます。"
      />
      <div className="relative mx-auto max-w-5xl">
        {/* 縦の接続線（PC は横一列、モバイルは縦積みなので CSS で切替）。
            ol の兄弟として置き、ol > li の直下構造を崩さない。 */}
        <div
          aria-hidden
          className="car-journey-line pointer-events-none absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-blue-400/50 via-violet-400/50 to-[#c9a55c]/50 md:left-0 md:right-0 md:top-4 md:h-px md:w-auto md:bg-gradient-to-r"
        />
        <ol className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
          {STAGES.map((s) => (
            <li key={s.n} className="car-journey-stage relative pl-12 md:pl-0 md:pt-12">
              <span
                aria-hidden
                className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold md:left-1/2 md:top-0 md:-translate-x-1/2"
                style={{ borderColor: s.color, color: s.color, background: "#0a0f1a" }}
              >
                {s.n}
              </span>
              <div className="md:text-center">
                <h3 className="text-base font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/85">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
