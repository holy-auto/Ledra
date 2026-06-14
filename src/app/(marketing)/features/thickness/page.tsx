import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "塗膜厚レポート",
  description:
    "PosiTector / DeFelsko などの膜厚計測データを車両・施工に紐付けて保管。施工前後の膜厚を、客観的な品質トレースとして残す Ledra の塗膜厚レポート機能です。",
  alternates: { canonical: "/features/thickness" },
};

const problems = [
  {
    title: "品質が「目視と経験」止まり",
    desc: "ていねいに塗っても、その膜厚は数値として残りません。仕上がりの良さを、客観的に示す手立てがない状態です。",
  },
  {
    title: "計測データが計測器に眠る",
    desc: "膜厚計で測っても、データは機器やメモに散在。どの車両のどの施工の測定値かが結びつかず、後から振り返れません。",
  },
  {
    title: "施工前後の比較を示せない",
    desc: "「どれだけ塗膜が乗ったか」を施工前後で比較できないと、顧客や保険会社に対して仕上がりの根拠を提示しにくくなります。",
  },
];

const capabilityCards = [
  {
    title: "計測器のデータを取り込む",
    description:
      "PosiTector / DeFelsko 系などの膜厚計測機から測定データを取り込み。測定日・デバイス型番・ブランドとともに保管します。",
  },
  {
    title: "車両・施工に紐付けて保管",
    description:
      "測定データを車両 VIN・施工メニュー・証明書に紐付け。未紐付け / 紐付け済み / 全体のタブで、件数を見ながら整理できます。",
  },
  {
    title: "施工前後の膜厚を比較",
    description:
      "施工前後の膜厚を比較できる形で残し、仕上がりを数値で裏付け。顧客説明や、保険会社向けの客観的なエビデンスとして活用できます。",
  },
  {
    title: "検索でいつでも遡れる",
    description: "測定日・デバイス型番・ブランド・車両 VIN・施工メニューで検索。過去の測定値にすぐ辿り着けます。",
  },
];

const flowSteps = [
  {
    step: "1",
    title: "膜厚を計測する",
    desc: "塗装 / コーティング作業時に、PosiTector / DeFelsko 系などの膜厚計測機で測定します。",
  },
  {
    step: "2",
    title: "データを取り込み、紐付ける",
    desc: "測定データを Ledra に取り込み、車両 VIN・施工メニュー・証明書に紐付け。どの施工の測定値かが明確になります。",
  },
  {
    step: "3",
    title: "品質エビデンスとして残す",
    desc: "施工前後の膜厚比較を品質トレースとして保管。顧客への説明や、保険会社の査定時の客観的な参考資料になります。",
  },
];

export default function ThicknessPage() {
  return (
    <>
      <PageHero
        badge="FEATURE › 塗膜厚レポート"
        title="仕上がりを、数値で裏付ける。"
        subtitle="PosiTector / DeFelsko などの膜厚計測データを車両・施工に紐付けて保管。施工前後の膜厚を、客観的な品質トレースとして残します。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="品質を、語れる形にする"
          subtitle="目視と経験だけでは、仕上がりの良さは伝わりきりません。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Capabilities */}
      <Section>
        <SectionHeading title="塗膜厚レポートでできること" subtitle="計測データを、施工の記録に結びつけます。" />
        <FeatureGrid className="mt-10">
          {capabilityCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section bg="alt">
        <SectionHeading title="計測から品質エビデンスまで" subtitle="測って、紐付けて、根拠として残す。" />
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
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="どの膜厚計測機に対応していますか？"
            answer="PosiTector / DeFelsko 系などの膜厚計測機の測定データを取り込めます。測定日・デバイス型番・ブランドとともに保管します。"
          />
          <FAQItem
            question="測定データは車両や証明書に紐付けられますか？"
            answer="はい。車両 VIN・施工メニュー・証明書に紐付けて保管できます。未紐付け / 紐付け済みのタブで整理し、後から紐付けを編集することも可能です。"
          />
          <FAQItem
            question="保険会社へのエビデンスとして使えますか？"
            answer="施工前後の膜厚比較を客観的な品質トレースとして残せるため、顧客への説明や、保険会社の査定時の参考資料として活用いただけます。"
          />
          <FAQItem
            question="過去の測定値は検索できますか？"
            answer="測定日・デバイス型番・ブランド・車両 VIN・施工メニューで検索できます。必要な測定値にすぐ辿り着けます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="仕上がりを、根拠として残す。"
        subtitle="膜厚を品質トレースに変える Ledra の塗膜厚レポートを試してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#certificate"
        trackLocation="thickness-cta"
      />
    </>
  );
}
