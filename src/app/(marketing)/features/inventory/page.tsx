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
  title: "在庫管理",
  description:
    "コーティング剤・フィルム・養生材・NFCタグなど部材を SKU 単位で管理。入出庫履歴・在庫価値・低在庫アラートを一画面で。Ledra の在庫管理機能です。",
  alternates: { canonical: "/features/inventory" },
};

const problems = [
  {
    title: "在庫が「だいたい」でしか分からない",
    desc: "コーティング剤やフィルムの残量は、棚を見て勘で判断。気づいたら切らしていて、施工当日に慌てて発注…という事態が起きます。",
  },
  {
    title: "誰がいつ使ったか追えない",
    desc: "材料の出庫が記録に残らないと、ロスや持ち出しに気づけません。原価がぶれて、メニューごとの利益も正確に見えなくなります。",
  },
  {
    title: "在庫の金額が把握できない",
    desc: "棚に眠る材料がいくら分あるのか。資産として見えていないと、仕入れの最適化も資金繰りの判断もしにくくなります。",
  },
];

const capabilityCards = [
  {
    title: "SKU 単位で在庫を可視化",
    description:
      "コーティング剤・フィルム・養生材・NFC タグなどを SKU 名称・カテゴリ・現在庫・最小在庫・在庫価値で一覧化。今ある材料が一目で分かります。",
  },
  {
    title: "入出庫・棚卸を履歴で記録",
    description:
      "入庫・出庫・調整（棚卸補正）を理由メモ付きで記録。いつ・何が・どれだけ動いたかが残るので、ロスの発見と原価の精度が上がります。",
  },
  {
    title: "低在庫をワンクリック抽出",
    description: "最小在庫を下回った SKU をフィルタで即抽出。切らす前に発注でき、施工当日の「材料がない」を防ぎます。",
  },
  {
    title: "在庫価値で資産を把握",
    description: "在庫を金額として集計。棚に眠る材料を資産として見える化し、仕入れと資金繰りの判断材料にできます。",
  },
];

const flowSteps = [
  {
    step: "1",
    title: "部材を SKU として登録",
    desc: "コーティング剤・フィルム・養生材・NFC タグなどを、名称・カテゴリ・最小在庫とともに登録します。",
  },
  {
    step: "2",
    title: "入出庫を記録する",
    desc: "仕入れ（入庫）と施工での消費（出庫）、棚卸の補正（調整）を理由メモ付きで記録。現在庫が常に最新に保たれます。",
  },
  {
    step: "3",
    title: "低在庫を見て発注する",
    desc: "最小在庫を下回った SKU をフィルタで抽出し、切らす前に発注。在庫価値で全体のボリュームも把握できます。",
  },
];

export default function InventoryPage() {
  return (
    <>
      <PageHero
        badge="FEATURE › 在庫管理"
        title="材料の残りを、勘から記録へ。"
        subtitle="コーティング剤・フィルム・養生材・NFC タグなどを SKU 単位で管理。入出庫履歴・在庫価値・低在庫アラートで、切らさず・ロスなく現場をまわします。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="材料管理の「見えない」を、なくす"
          subtitle="在庫が見えないことが、欠品・ロス・原価のブレにつながります。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Capabilities */}
      <Section>
        <SectionHeading title="在庫管理でできること" subtitle="現場の材料を、数字で扱えるようにします。" />
        <FeatureGrid className="mt-10">
          {capabilityCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section bg="alt">
        <SectionHeading title="登録から発注まで" subtitle="登録して、記録して、切らす前に動く。" />
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
            question="どんな品目を管理できますか？"
            answer="コーティング剤・フィルム・養生材・NFC タグなど、施工で使う部品・消耗品を SKU 単位で管理できます。カテゴリで分類して一覧できます。"
          />
          <FAQItem
            question="棚卸にも対応していますか？"
            answer="はい。入庫・出庫に加えて、棚卸時の補正を「調整」として理由メモ付きで記録できます。実在庫とのズレを履歴に残せます。"
          />
          <FAQItem
            question="在庫が少なくなったら気づけますか？"
            answer="SKU ごとに最小在庫を設定でき、それを下回った品目を低在庫フィルタでワンクリック抽出できます。切らす前の発注に役立ちます。"
          />
          <FAQItem
            question="POS（会計）と連動しますか？"
            answer="チェックアウト完了時に消費分を自動で引き落とす POS 連動を順次提供予定です。現時点でも入出庫の手動記録で在庫を最新に保てます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="材料を、切らさず・ロスなく。"
        subtitle="部材の在庫を数字で扱う Ledra の在庫管理を、現場で試してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#operations"
        trackLocation="inventory-cta"
      />
    </>
  );
}
