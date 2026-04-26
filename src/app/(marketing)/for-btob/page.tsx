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
    "コーティング・PPF・ラッピング・板金塗装の外注先をお探しですか？Ledraなら全国の認定施工店へ発注から支払いまで一元管理。取引手数料0円で、現場に直接利益を届けます。",
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
    title: "中間マージンで現場に利益が残らない",
    desc: "仲介業者を通すたびに手数料が乗る。実際に施工してくれる職人には、思ったより報酬が届いていない。",
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
    desc: "施工完了と同時に証明書が発行。QRコードと写真つきで、施工内容が永久に記録されます。",
  },
  {
    step: "5",
    title: "プラットフォーム上で精算",
    desc: "合意した金額を施工店に直接支払い。取引手数料は0円。中間マージンは発生しません。",
  },
];

const features = [
  {
    title: "全国の認定施工店ネットワーク",
    description:
      "PPF・コーティング・ラッピング・板金塗装など、専門施工店へ直接依頼。エリアや得意分野で絞り込めます。",
  },
  {
    title: "取引手数料0円",
    description:
      "Ledraは施工店と依頼企業の間に取引手数料を課しません。合意した金額がそのまま現場に届きます。",
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
        subtitle="全国の認定施工店に直接発注。取引手数料0円で、現場の職人に利益が届く新しいBtoBプラットフォームです。見積もり・進捗管理・デジタル証明書まで、ひとつの画面で完結します。"
      />

      {/* Hero CTA + zero fee badge */}
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-medium">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
              取引手数料0円 — 合意金額の100%が施工店に届きます
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

      {/* Zero fee emphasis */}
      <Section>
        <div className="mx-auto max-w-3xl">
          <ScrollReveal variant="fade-up">
            <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-8 md:p-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-green-300 bg-green-500/10 border border-green-500/20 mb-6">
                取引手数料について
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                施工店に届くのは、合意金額の
                <span className="text-green-400"> 100%</span>
              </h2>
              <p className="mt-4 text-[0.938rem] leading-[1.9] text-white/60 max-w-xl mx-auto">
                Ledraの受発注プラットフォームは、取引ごとの手数料を一切課しません。
                仲介マージンがない分、施工店は適正価格で受注でき、依頼企業は余計なコストを払わずに済みます。
                プラットフォームの維持はサブスクリプション型の月額料金でまかなわれており、
                取引そのものには課金しません。
              </p>
              <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm mx-auto">
                {[
                  { label: "取引手数料", value: "0円" },
                  { label: "仲介マージン", value: "なし" },
                  { label: "隠れたコスト", value: "なし" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-green-500/20 bg-green-500/[0.04] p-4 text-center"
                  >
                    <div className="text-xl font-bold text-green-400">{item.value}</div>
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
            question="取引手数料が本当に0円というのは本当ですか？"
            answer="はい。受発注の取引ごとに手数料は発生しません。Ledraはサブスクリプション型の月額プランで運営されており、施工店が受け取る金額から差し引かれるものはありません。"
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
            question="利用料金はどのくらいかかりますか？"
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
        title="現場に、利益が届く仕組みを。"
        subtitle="取引手数料0円のBtoBプラットフォームで、施工依頼をはじめましょう。"
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
