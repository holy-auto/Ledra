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
    "NexPTG（NexDiag）の膜厚計アプリから測定データを取り込み、VIN で車両に自動紐付け。施工品質を客観的な計測データとして残す Ledra の塗膜厚レポート機能です。",
  alternates: { canonical: "/features/thickness" },
};

const problems = [
  {
    title: "品質が「目視と経験」止まり",
    desc: "ていねいに塗っても、その膜厚は数値として残りません。仕上がりの良さを、客観的に示す手立てがない状態です。",
  },
  {
    title: "計測データが計測器に眠る",
    desc: "膜厚計で測っても、データは機器やメモに散在。どの車両の測定値かが結びつかず、後から振り返れません。",
  },
  {
    title: "品質の裏付けが口頭だけ",
    desc: "膜厚という客観的な数値があっても、記録として残さなければ、顧客や品質管理での説明は口頭止まりになります。",
  },
];

const capabilityCards = [
  {
    title: "NexPTG の測定データを取り込む",
    description:
      "NexPTG（NexDiag）の膜厚計アプリから測定データを取り込み。測定日・デバイスのシリアル番号・ブランド・モデルとともに保管します。",
  },
  {
    title: "VIN で車両に自動紐付け",
    description:
      "取り込んだ測定レポートを、VIN をキーに該当車両へ自動で紐付け。未紐付け / 紐付け済みのタブで、紐付け状況を確認しながら整理できます。",
  },
  {
    title: "品質を数値として残す",
    description:
      "膜厚を計測データとして車両に紐付けて保管。施工品質を、申告ではなく数値で裏付けられます。顧客への説明や品質管理の資料として活用できます。",
  },
  {
    title: "AI による測定値の異常検知",
    description:
      "取り込んだ測定値に対する AI 異常検知の結果をレポートに付与。値のばらつきや外れ値の気づきを補助します。",
  },
];

const flowSteps = [
  {
    step: "1",
    title: "膜厚を計測する",
    desc: "塗装 / コーティング作業時に、NexPTG（NexDiag）の膜厚計で測定し、アプリに記録します。",
  },
  {
    step: "2",
    title: "取り込んで、車両に紐付ける",
    desc: "NexPTG アプリから Ledra に測定レポートを取り込み。VIN が一致する車両に自動で紐付きます。一致しなかったものは『未紐付け』として確認できます。",
  },
  {
    step: "3",
    title: "品質の記録として残す",
    desc: "膜厚を客観的な計測データとして車両に紐付けて保管。品質管理や、顧客への説明の裏付けとして活用できます。",
  },
];

export default function ThicknessPage() {
  return (
    <>
      <PageHero
        badge="FEATURE › 塗膜厚レポート"
        title="仕上がりを、数値で裏付ける。"
        subtitle="NexPTG（NexDiag）の膜厚計アプリから測定データを取り込み、VIN で車両に自動紐付け。施工品質を、客観的な計測データとして残します。"
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
        <SectionHeading title="塗膜厚レポートでできること" subtitle="計測データを、車両の記録に結びつけます。" />
        <FeatureGrid className="mt-10">
          {capabilityCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section bg="alt">
        <SectionHeading title="計測から品質記録まで" subtitle="測って、取り込んで、車両の記録として残す。" />
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
            question="どの膜厚計に対応していますか？"
            answer="NexPTG（NexDiag）の膜厚計アプリからの取り込みに対応しています。測定日・デバイスのシリアル番号・ブランド・モデルとともに保管します。"
          />
          <FAQItem
            question="測定データはどうやって車両に紐付きますか？"
            answer="VIN をキーに、一致する車両へ自動で紐付きます。VIN が一致しなかったレポートは『未紐付け』として確認でき、車両側に VIN を登録するか、再同期することで紐付きます。"
          />
          <FAQItem
            question="取り込んだ測定値の異常は分かりますか？"
            answer="取り込んだ測定値に対する AI 異常検知の結果をレポートに付与します。値のばらつきや外れ値の気づきを補助する用途です。"
          />
          <FAQItem
            question="品質の裏付けとして使えますか？"
            answer="膜厚を客観的な計測データとして車両に紐付けて残せるため、顧客への説明や、社内の品質管理の資料として活用いただけます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="仕上がりを、記録として残す。"
        subtitle="膜厚を客観的な計測データに変える Ledra の塗膜厚レポートを試してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#certificate"
        trackLocation="thickness-cta"
      />
    </>
  );
}
