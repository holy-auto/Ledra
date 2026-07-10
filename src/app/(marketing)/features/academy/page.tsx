import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "Ledra Academy（社内教育）",
  description:
    "施工技能の習熟と社内教育を支援する学習プラットフォーム。教材・クイズ、施工事例ライブラリ、受講進捗の追跡、受講証明書の発行までを Ledra の中で完結します（Standard / Pro）。",
  alternates: { canonical: "/features/academy" },
};

const problems = [
  {
    title: "教育が「先輩の背中」だのみ",
    desc: "施工の技能は、口頭と現場の見て覚えるに偏りがち。教える人によって内容が変わり、新人が一人前になるまでの時間が読めません。",
  },
  {
    title: "品質のばらつきが見えない",
    desc: "誰がどれだけ習熟しているか、店舗としての品質がどの水準か。数字で持っていないと、改善の打ち手も評価も主観になります。",
  },
  {
    title: "ナレッジが個人に閉じる",
    desc: "うまくいった施工も、つまずいた事例も、担当者の記憶に残るだけ。チームの財産として蓄積・共有されません。",
  },
];

const modules = [
  {
    title: "レッスン・クイズ",
    description: "教材を作成・編集し、クイズ設問で理解度を確認。施工手順や注意点を、店舗の標準として形に残せます。",
  },
  {
    title: "施工事例ライブラリ",
    description:
      "自店の施工事例を「候補 → 公開」のフローで承認・蓄積。品質スコア（平均・ばらつき）を集計し、教育とブランディングの両方に活かせます。",
  },
  {
    title: "進捗トラッキング・受講証明",
    description: "受講者ごとの修了状況を追跡。修了者には受講証明書を PDF で発行でき、教育の実施を対外的にも示せます。",
  },
  {
    title: "QA アシスタント",
    description:
      "施工に関する疑問を、その場でチャットに質問。現場のちょっとした「これで合ってる？」を解消し、オンボーディングを支えます。",
  },
];

const flowSteps = [
  {
    step: "1",
    title: "教材とクイズを用意する",
    desc: "施工手順・使用材料・注意点を教材化し、クイズ設問を添えます。プラットフォーム提供の型を下敷きに、自店の標準として整えられます。",
  },
  {
    step: "2",
    title: "事例を蓄積し、品質を数値で見る",
    desc: "実際の施工事例を候補として登録し、公開フローで承認。品質スコアが集計され、店舗としての品質水準とばらつきが見えるようになります。",
  },
  {
    step: "3",
    title: "受講と修了を追跡する",
    desc: "受講者ごとの進捗を追跡し、修了者には受講証明書を発行。誰がどこまで習熟したかが、感覚ではなく記録として残ります。",
  },
];

export default function AcademyPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "Ledraアカデミー", url: "/features/academy" },
        ]}
      />
      <PageHero
        badge="FEATURE › Ledra Academy"
        title="施工品質を、人とチームに定着させる。"
        subtitle="教材・クイズ、施工事例ライブラリ、受講進捗の追跡、受講証明書の発行まで。施工技能の習熟と社内教育を、Ledra の中で仕組みにします。"
      />

      {/* Plan note */}
      <Section bg="alt" className="!py-10">
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-3xl rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] px-6 py-5 text-center">
            <p className="text-sm leading-relaxed text-white">
              Ledra Academy は <span className="font-bold text-blue-300">Standard / Pro プラン</span>{" "}
              でご利用いただけます。
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* Problems */}
      <Section>
        <SectionHeading
          title="教育が、属人化したままになっていませんか"
          subtitle="技能とナレッジが個人に閉じると、品質も育成スピードも安定しません。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Modules */}
      <Section bg="alt">
        <SectionHeading title="Academy の構成" subtitle="学ぶ・蓄える・確かめる、を一つのプラットフォームで。" />
        <FeatureGrid className="mt-10">
          {modules.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section>
        <SectionHeading
          title="教育を仕組みにする流れ"
          subtitle="作って、蓄えて、追跡する。3つのステップで定着します。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {flowSteps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section bg="alt">
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="どのプランで使えますか？"
            answer="Ledra Academy は Standard / Pro プランの機能です。プランの詳細は料金ページをご覧ください。"
          />
          <FAQItem
            question="教材は自分たちで作る必要がありますか？"
            answer="プラットフォーム提供の型を下敷きに、自店の手順・注意点を反映して教材を作成・編集できます。クイズ設問もエディタで用意できます。"
          />
          <FAQItem
            question="受講証明書は発行できますか？"
            answer="はい。受講者ごとの修了状況を追跡し、修了者には受講証明書を PDF で発行できます。"
          />
          <FAQItem
            question="施工事例の品質スコアとは何ですか？"
            answer="登録した施工事例に対するスコアを集計し、平均やばらつきとして可視化するものです。店舗としての品質水準を数値で把握し、教育に活かせます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="技能を、チームの標準にする。"
        subtitle="教育と品質を仕組みにする Ledra Academy。Standard / Pro でご利用いただけます。"
        primaryLabel="料金プランを見る"
        primaryHref="/pricing"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#academy"
        trackLocation="academy-cta"
      />
    </>
  );
}
