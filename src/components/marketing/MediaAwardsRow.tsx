import { Section } from "./Section";
import { ScrollReveal } from "./ScrollReveal";

/**
 * MediaAwardsRow — 受賞・メディア掲載の枠を、最初から「準備中」として持つ。
 *
 * SmartHR の ITreview / BOXIL バッジに相当する社会的証明枠。Ledra は
 * 取り立てて掲載が無い段階でも「これから入る場所」として用意し、訪問者に
 * 成長過程を共有する。掲載が決まり次第、各スロットを置き換える。
 */

type Slot = {
  kind: "filled" | "open";
  caption: string;
  /** filled の場合のメディア / 受賞名 */
  name?: string;
  /** filled の場合のリンク */
  href?: string;
};

const SLOTS: Slot[] = [
  { kind: "open", caption: "業界紙への掲載枠" },
  { kind: "open", caption: "DXアワード参加枠" },
  { kind: "open", caption: "保険業界アライアンス枠" },
  { kind: "open", caption: "SaaSレビュー高評価枠" },
];

export function MediaAwardsRow() {
  return (
    <Section bg="alt" id="media">
      <ScrollReveal variant="fade-up">
        <div className="text-center">
          <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[0.65rem] font-medium uppercase tracking-widest text-white/80">
            掲載 / 評価
          </span>
          <h3 className="mt-5 text-lg md:text-xl font-bold text-white">
            業界の声を、あえてこれから書き込んでいきます。
          </h3>
          <p className="mt-3 text-xs md:text-sm leading-relaxed text-white/75 max-w-2xl mx-auto">
            掲載・受賞バッジは「あったように見せる」ことより、「これから一緒に作る」ほうが Ledra
            らしいと考えます。各スロットは取材・受賞が決まり次第、掲載していきます。
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal variant="fade-up" delay={120}>
        <div className="mx-auto mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
          {SLOTS.map((s, i) =>
            s.kind === "filled" ? (
              <a
                key={`${s.name}-${i}`}
                href={s.href ?? "#"}
                className="rounded-xl border border-white/[0.1] bg-white/[0.04] p-5 text-center hover:bg-white/[0.06] transition-colors"
              >
                <p className="text-sm font-semibold text-white">{s.name}</p>
                <p className="mt-1.5 text-[0.65rem] text-white/70">{s.caption}</p>
              </a>
            ) : (
              <div
                key={`open-${i}`}
                className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.01] p-5 text-center"
              >
                <p className="text-[0.65rem] font-medium uppercase tracking-widest text-white/70">Coming soon</p>
                <p className="mt-2 text-xs text-white/80">{s.caption}</p>
              </div>
            ),
          )}
        </div>
      </ScrollReveal>
    </Section>
  );
}
