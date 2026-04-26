import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { CTAButton } from "@/components/marketing/CTAButton";

export const metadata = {
  title: "施工を依頼したい企業の方へ",
  description:
    "コーティング・PPF・ラッピング・板金塗装の外注先をお探しですか？Ledraなら全国の認定施工店へ発注から支払いまで一元管理。プラットフォーム手数料10%で決済・証明書発行まで完全自動化します。",
  alternates: { canonical: "/for-btob" },
};

const challenges = [
  {
    title: "毎回、電話とメールで依頼先を探す",
    desc: "信頼できる施工店をその都度探して、電話して、見積もりをもらって。依頼のたびに時間が消える。",
  },
  {
    title: "施工品質がバラバラ",
    desc: "依頼する店が変わるたびに仕上がりが違う。品質の基準が共有できていない。",
  },
  {
    title: "完了の証明が残らない",
    desc: "施工が終わっても記録は口頭だけ。後から確認を求められても、証拠が何もない。",
  },
  {
    title: "支払いと証明書の管理が煩雑",
    desc: "施工完了後の請求確認・振込・証明書回収を手作業で行うと、件数が増えるほど工数が膨らむ。",
  },
];

const steps = [
  {
    step: "1",
    title: "無料登録して案件を作成",
    desc: "施工内容・車両情報・予算・納期を入力して案件を登録。特定の店舗を指定しても、公開してマッチングしてもらってもOK。",
  },
  {
    step: "2",
    title: "施工店から見積もりを受け取る",
    desc: "登録した案件に施工店が応答。金額・納期・対応内容を確認して、受注先を決定します。",
  },
  {
    step: "3",
    title: "作業の進捗をリアルタイムで確認",
    desc: "作業中・完了報告・写真アップロードなど、施工店からの更新をプラットフォーム上で受け取れます。",
  },
  {
    step: "4",
    title: "デジタル施工証明書で完了確認",
    desc: "施工完了と同時に証明書が自動発行。QRコードと写真つきで、施工内容が永久に記録されます。",
  },
  {
    step: "5",
    title: "決済を自動処理、施工店に自動送金",
    desc: "合意金額からプラットフォーム手数料10%を引いた金額が施工店へ自動送金されます。請求書の発行・入金確認・振込の手間がすべてなくなります。",
  },
];

const features = [
  {
    title: "全国の認定施工店ネットワーク",
    description:
      "PPF・コーティング・ラッピング・板金塗装など、専門施工店へ直接依頼。エリアや得意分野で絞り込めます。",
  },
  {
    title: "決済・送金の完全自動化",
    description:
      "Stripeによる決済処理と施工店への自動送金。支払い確認・振込の手作業がゼロになります。手数料10%で全てを自動化。",
  },
  {
    title: "デジタル施工証明書",
    description:
      "施工完了と同時にQRコード付き証明書が自動発行。保険会社への提出や社内の納品確認がスムーズになります。",
  },
  {
    title: "一元化された発注管理",
    description:
      "複数の案件を一画面で管理。申請中・作業中・完了まで、ステータスをリアルタイムで把握できます。",
  },
  {
    title: "パートナーランクで品質を可視化",
    description:
      "施工店の完了件数・評価・納期遵守率がスコア化されています。依頼先選びの参考にできます。",
  },
  {
    title: "ブロックチェーン証明",
    description:
      "施工証明書はPolygonブロックチェーンに刻まれます。改ざん不可の記録として、法的証拠にも使えます。",
  },
];

const usecases = [
  {
    title: "カーディーラー",
    desc: "納車前コーティングをまとめて外注。施工証明書つきで顧客へ納品できます。",
  },
  {
    title: "レンタカー・カーシェア事業者",
    desc: "車両保護フィルムの定期施工をネットワーク内の施工店で計画的に発注できます。",
  },
  {
    title: "フリート管理会社",
    desc: "複数車両の板金・コーティングを一元管理。施工履歴が全てデジタルで残ります。",
  },
  {
    title: "保険会社・損保代理店",
    desc: "修理・リペア依頼を施工店へ直接繋ぎ、証明書つきで完了報告を受け取れます。",
  },
];

export default function ForBtoBPage() {
  return (
    <>
      <PageHero
        badge="FOR BUSINESS"
        title="施工を依頼したい企業の方へ"
        subtitle="全国の認定施工店に直接発注。プラットフォーム手数料10%で決済・証明書発行・進捗管理まで完全自動化します。見積もりから支払いまで、ひとつの画面で完結。"
      />

      {/* Hero CTA + fee badge */}
      <Section>
        <div className="text-center space-y-6">
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <CTAButton variant="primary" href="/contact?role=btob" trackLocation="for-btob-hero">
              無料で相談する
            </CTAButton>
            <CTAButton variant="outline" href="/signup" trackLocation="for-btob-hero">
              アカウントを作成
            </CTAButton>
          </div>
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-medium">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
              プラットフォーム手数料10% — 決済自動化・証明書発行・進捗管理が全て込み
            </div>
          </div>
        </div>
      </Section>

      {/* Pain points */}
      <Section bg="alt">
        <SectionHeading
          title="こんなお悩み、ありませんか？"
          subtitle="施工を外注する企業が抱える、よくある課題です。"
        />
        <FeatureGrid className="mt-10">
          {challenges.map((c, i) => (
            <FeatureCard key={c.title} variant="bordered" title={c.title} description={c.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Fee structure emphasis */}
      <Section>
        <div className="mx-auto max-w-3xl">
          <ScrollReveal variant="fade-up">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-8 md:p-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 mb-6">
                手数料の仕組み
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                手数料<span className="text-blue-400"> 10%</span> で、決済を丸ごと自動化
              </h2>
              <p className="mt-4 text-[0.938rem] leading-[1.9] text-white/60 max-w-xl mx-auto">
                合意金額の10%をプラットフォーム手数料としていただきます。
                その代わり、決済処理・施工店への自動送金・施工証明書の発行・進捗通知まで、
                支払い周りの作業が全て自動化されます。
                従来の仲介業者（20〜30%）と比べて低コストで、煩雑な手作業もなくなります。
              </p>
              <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm mx-auto">
                {[
                  { label: "プラットフォーム手数料", value: "10%" },
                  { label: "決済自動化", value: "込み" },
                  { label: "証明書発行", value: "自動" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4 text-center"
                  >
                    <div className="text-xl font-bold text-blue-400">{item.value}</div>
                    <div className="mt-1 text-xs text-white/40">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Section>

      {/* Use cases */}
      <Section bg="alt">
        <SectionHeading title="こんな企業に使われています" subtitle="業種を問わず、車両施工の外注管理にご活用いただけます。" />
        <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          {usecases.map((u, i) => (
            <ScrollReveal key={u.title} variant="fade-up" delay={i * 60}>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-full">
                <h3 className="text-[1.063rem] font-bold text-white leading-snug">{u.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/55">{u.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading
          title="発注の流れ"
          subtitle="アカウントを作成すれば、すぐに施工依頼を開始できます。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {steps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white/60">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section bg="alt" id="features">
        <SectionHeading title="プラットフォームの機能" subtitle="発注から完了証明まで、必要なものがそろっています。" />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="Ledraに登録していない施工店には発注できますか？"
            answer="現在のBtoBプラットフォームはLedra登録施工店間での受発注に対応しています。連携させたい施工店がある場合は、施工店側に無料アカウントを作成いただくことで発注が可能になります。"
          />
          <FAQItem
            question="プラットフォーム手数料の10%は誰が負担しますか？"
            answer="手数料は取引金額から差し引かれ、施工店の受取金額が合意額の90%になります。決済自動化・証明書発行・進捗管理の全機能がこの10%に含まれます。従来の仲介業者（20〜30%）よりも低コストで、かつ手作業がゼロになります。"
          />
          <FAQItem
            question="施工証明書は保険会社や社内向けに使えますか？"
            answer="はい。施工完了時に自動発行されるデジタル証明書はQRコードつきで、保険会社への提出・社内の納品確認・顧客への共有に対応しています。PDFでの印刷・エクスポートも可能です。"
          />
          <FAQItem
            question="複数の施工案件を並行して管理できますか？"
            answer="はい。受発注管理画面では複数の案件をステータス別に一覧表示できます。申請中・見積中・作業中・完了など、進捗をリアルタイムで把握できます。"
          />
          <FAQItem
            question="月額プランの費用はどのくらいかかりますか？"
            answer={
              <>
                受発注機能は無料プランから利用可能です。より高度な管理機能が必要な場合はStarter / Standard / Proプランをご検討ください。詳細は
                <a href="/pricing" className="text-blue-400 underline">
                  料金ページ
                </a>
                をご覧ください。
              </>
            }
          />
        </FAQList>
      </Section>

      <CTABanner
        title="発注から支払いまで、全て自動化。"
        subtitle="プラットフォーム手数料10%で、施工外注の面倒をまるごと解消します。"
        primaryLabel="無料で相談する"
        primaryHref="/contact?role=btob"
        secondaryLabel="アカウントを作成"
        secondaryHref="/signup"
        tertiaryLabel="料金を確認する"
        tertiaryHref="/pricing"
        trackLocation="for-btob-final"
      />
    </>
  );
}
