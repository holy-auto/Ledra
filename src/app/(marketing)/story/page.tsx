import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "創業ストーリー ── 現場から生まれた「履歴に嘘をつかせない」仕組み",
  description:
    "スポーツトレーナー専門学校を中退し、町の整備工場で整備・鈑金塗装・コーティングを学び、47都道府県を出張施工で回った代表・堀越友輔が、なぜ施工証明SaaS「Ledra」を作ったのか。創業の経緯とプロダクトへの想い。",
  alternates: { canonical: "/story" },
  openGraph: {
    title: "創業ストーリー | Ledra",
    description: "現場で働いてきた人間が、現場のために作った施工証明SaaS。Ledra 誕生の経緯と想い。",
    url: "/story",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
};

/**
 * 掲載する経歴・出来事は事実のみ（要望⑧: 嘘のないリアル）。
 * 年数・数値の脚色はしない。新しい事実を足すときも同じルールで。
 */
const journey = [
  {
    era: "出発点",
    title: "スポーツトレーナー専門学校を中退",
    body: "最初のキャリアは自動車ではありませんでした。回り道から始まったからこそ、「現場で手を動かして覚える」以外の選択肢がなかった。",
  },
  {
    era: "現場",
    title: "町の整備工場で、整備・鈑金塗装・コーティング・用品取付を経験",
    body: "車がどう直され、どう仕上げられ、どこで手を抜けてしまうのか。全部を自分の手でやったから知っています。きれいな言葉ではなく、油と塗料のにおいの中で覚えた仕事です。",
  },
  {
    era: "独立",
    title: "47都道府県を出張施工で回る",
    body: "独立後は出張作業を軸に、全国の現場を見てきました。技術のある職人が、その技術を証明する手段を持っていない——どの県でも同じ課題がありました。",
  },
  {
    era: "2024年11月",
    title: "株式会社HOLYを設立",
    body: "個人の腕から、仕組みへ。法人化したのは、施工の信頼を「一人の職人の評判」ではなく「業界のインフラ」にするためです。",
  },
  {
    era: "いま",
    title: "Ledra を開発",
    body: "自動車業界で信頼を揺るがす不正が相次ぎました。壊れた信頼は、口約束では戻りません。だから、現場の知見とAI・改ざん不可能な記録を組み合わせた Ledra を作りました。",
  },
];

export default function StoryPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "創業ストーリー", url: "/story" }]} />
      <PageHero
        badge="OUR STORY"
        title="履歴に嘘をつかせない、と決めた日。"
        subtitle="Ledra は、投資家向けの資料から生まれたサービスではありません。現場で車を直し、磨き、全国を回ってきた人間が「この業界には証明が足りない」と確信して作ったサービスです。"
      />

      <Section>
        <SectionHeading title="代表・堀越友輔の歩み" subtitle="ここに書いてあることは、すべて事実です。" />
        <ol className="relative mx-auto max-w-3xl space-y-10 border-l border-white/[0.08] pl-8">
          {journey.map((item, i) => (
            <ScrollReveal key={item.title} variant="fade-up" delay={i * 100}>
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[2.4rem] top-1.5 block h-3 w-3 rounded-full border border-blue-400/60 bg-[#060a12]"
                />
                <div className="text-xs font-medium uppercase tracking-widest text-blue-300">{item.era}</div>
                <h3 className="mt-2 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/90">{item.body}</p>
              </li>
            </ScrollReveal>
          ))}
        </ol>
      </Section>

      <Section bg="alt">
        <SectionHeading title="なぜ「証明」なのか" />
        <div className="mx-auto max-w-3xl space-y-6 text-sm md:text-base leading-relaxed text-white/90">
          <ScrollReveal variant="fade-up">
            <p>
              良い施工と悪い施工の差は、納車の瞬間にはほとんど見えません。差が出るのは半年後、3年後、車を売るとき、保険を使うとき。
              つまり<strong className="text-white">技術の価値は「記録が残っているか」で決まる</strong>のに、
              この業界の記録は紙の保証書と口頭の説明のままでした。
            </p>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={100}>
            <p>
              大手の不正が報道されるたびに、真面目にやっている現場ほど疑われる。それが一番悔しかった。 だから Ledra
              は、施工店が「うちはちゃんとやっている」を口ではなくデータで示せる仕組みにしました。
              発行した証明書は改ざんできない形で記録され、保険会社も、次のオーナーも、同じ事実を見られます。
            </p>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={200}>
            <p>
              このサイトに載せる数字も同じ方針です。導入社数や発行件数は
              <Link href="/financial-transparency" className="mx-1 text-blue-400 hover:underline">
                本番データベースの実数
              </Link>
              をそのまま表示しています。履歴に嘘をつかせないサービスが、自分の実績に嘘をついたら終わりだからです。
            </p>
          </ScrollReveal>
        </div>
      </Section>

      <CTABanner
        title="現場の技術に、証明を。"
        subtitle="同じ悔しさを知っている施工店の方と、一緒に業界を作り直したい。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="正直な比較を見る"
        secondaryHref="/honest-comparison"
        trackLocation="story-final"
      />
    </>
  );
}
