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
  title: "代理店の方へ",
  description: "Ledra パートナープログラム。施工店を紹介して継続コミッションを受け取る、代理店向けの仕組みです。",
  alternates: { canonical: "/for-agents" },
};

const reasons = [
  {
    title: "市場が立ち上がる前に乗る",
    desc: "WEB施工証明書という新しいカテゴリ。先行する代理店ほど、紹介ネットワークと経験値で優位を築けます。",
  },
  {
    title: "継続報酬の積み上げ",
    desc: "紹介先が利用を続ける限り、月次でコミッションが発生。一度の紹介が長期収益になります。",
  },
  {
    title: "営業負担を軽くする道具",
    desc: "提案資料・パンフレット・動画教材・デモ環境まで、当社が提供。代理店は本業の合間でも紹介可能です。",
  },
  {
    title: "信頼で選ばれるサービスを",
    desc: "改ざん不可能なデジタル証明書という『嘘がつけない』性質。紹介先施工店の信用にも繋がります。",
  },
];

const features = [
  {
    title: "専用ダッシュボード",
    description: "紹介数・成約率・コミッション実績・顧客ステータスをリアルタイム把握。",
  },
  {
    title: "紹介リンク管理",
    description: "代理店ごとのトラッキング URL を生成。どの紹介がどの成約に繋がったかを完全可視化。",
  },
  {
    title: "営業資料・素材",
    description: "提案書・パンフレット・動画素材・FAQ集をダウンロード可能。紙にも、メールにも、商談にも。",
  },
  {
    title: "デモ環境",
    description: "サンプルデータ入りのデモテナントをご提供。実画面を見せながらの提案ができます。",
  },
  {
    title: "ランキング・特別報酬",
    description: "パートナー間の実績ランキング。上位パートナーには別途特別報酬・優先オファーをご用意。",
  },
  {
    title: "研修プログラム",
    description: "Ledra の機能・販売ノウハウ・業界動向を学べる研修コンテンツ。新任担当者の立ち上げにも。",
  },
  {
    title: "Stripe Connect 自動振込",
    description: "コミッションは Stripe Connect 経由で月次自動振込。請求書発行・税務処理の手間を最小化。",
  },
  {
    title: "専用サポート",
    description: "代理店専用のサポート窓口・FAQ・コミュニティ。営業現場の疑問を即解消できる体制。",
  },
];

const steps = [
  {
    step: "1",
    title: "パートナー申請",
    desc: "オンラインフォームから申請。法人番号・連絡先・実績の概要をご記入いただきます。",
  },
  {
    step: "2",
    title: "審査・契約",
    desc: "1〜3営業日以内に審査結果をご連絡。Ledra の電子署名で電子契約を締結します。",
  },
  {
    step: "3",
    title: "ダッシュボード開設",
    desc: "代理店専用ダッシュボードと紹介リンクが利用可能に。営業資料一式をお渡しします。",
  },
  {
    step: "4",
    title: "施工店を紹介",
    desc: "紹介リンク・電話・対面、いずれの方法でも。商談記録を専用フォームで管理可能。",
  },
  {
    step: "5",
    title: "コミッション受取",
    desc: "成約・継続利用に応じて、Stripe Connect で月次自動振込。実績はダッシュボードで常時確認可能。",
  },
];

export default function ForAgentsPage() {
  return (
    <>
      <PageHero
        badge="FOR AGENTS"
        title="紹介で、業界の標準を一緒に作る。"
        subtitle="Ledra パートナープログラムで、施工店を紹介。一度の紹介が継続報酬になり、業界の記録文化の更新に貢献できます。"
      />

      {/* Reasons */}
      <Section bg="alt">
        <SectionHeading
          title="なぜ Ledra のパートナーか"
          subtitle="新しいカテゴリの立ち上げに、最初から関わる意義があります。"
        />
        <FeatureGrid className="mt-10">
          {reasons.map((r, i) => (
            <FeatureCard key={r.title} variant="bordered" title={r.title} description={r.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Commission model — visual */}
      <Section>
        <SectionHeading
          title="コミッションモデル"
          subtitle="シンプルで透明性の高い設計。実績はリアルタイムにダッシュボードで確認できます。"
        />
        <div className="mx-auto mt-10 max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-5">
          <ScrollReveal variant="fade-up" delay={0}>
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-6 text-center">
              <p className="text-xs uppercase tracking-wider text-blue-300">初期成約報酬</p>
              <p className="mt-3 text-3xl font-bold text-white tracking-tight">¥30,000〜</p>
              <p className="mt-3 text-xs leading-relaxed text-white/80">
                紹介先がプランを契約し、初月利用料を支払った時点で確定。
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={100}>
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/[0.1] to-violet-500/[0.05] p-6 text-center relative overflow-hidden">
              <span className="absolute top-3 right-3 text-[0.6rem] uppercase tracking-wider text-blue-200">MAIN</span>
              <p className="text-xs uppercase tracking-wider text-blue-300">継続報酬</p>
              <p className="mt-3 text-3xl font-bold text-white tracking-tight">月額の 10%</p>
              <p className="mt-3 text-xs leading-relaxed text-white/80">
                紹介先が利用を続ける限り、毎月のサブスクリプション料金の 10% が継続的に発生します。
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={200}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
              <p className="text-xs uppercase tracking-wider text-blue-300">特別報酬</p>
              <p className="mt-3 text-3xl font-bold text-white tracking-tight">+α</p>
              <p className="mt-3 text-xs leading-relaxed text-white/80">
                ランキング上位・大型成約・キャンペーン期間等で個別の特別報酬を支給。
              </p>
            </div>
          </ScrollReveal>
        </div>
        <p className="mt-8 text-center text-xs text-white/75">
          ※ 金額はプランにより異なります。詳細は契約時にご案内いたします。
        </p>
      </Section>

      {/* Features */}
      <Section bg="alt" id="features">
        <SectionHeading
          title="代理店ポータルの機能"
          subtitle="紹介・成約管理・コミッション・研修まで、すべて専用ダッシュボードに集約。"
        />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Workflow */}
      <Section>
        <SectionHeading title="パートナー登録の流れ" subtitle="申請から運用開始まで、最短で1週間程度。" />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {steps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white/80">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Pilot CTA */}
      <Section bg="alt">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
            FOUNDING PARTNERS
          </span>
          <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">
            創業期パートナーを募集しています
          </h2>
          <p className="mt-4 text-[0.938rem] md:text-base leading-[1.9] text-white/80 max-w-xl mx-auto">
            最初期の代理店パートナー様には、優遇コミッション、独占エリア設定、共同マーケティング機会をご提供します。
            <br />
            代理店として、業界の新しい標準を一緒に立ち上げてみませんか。
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <CTAButton variant="primary" href="/contact?role=agent" trackLocation="for-agents-pilot">
              パートナー申請をする
            </CTAButton>
            <CTAButton variant="outline" href="/resources" trackLocation="for-agents-pilot">
              代理店向け資料をダウンロード
            </CTAButton>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="個人でも代理店として登録できますか？"
            answer="原則として法人または個人事業主としてご登録いただいております。詳細は申請時にご相談ください。"
          />
          <FAQItem
            question="施工業界の経験がなくても大丈夫ですか？"
            answer="はい、業界経験は不要です。研修プログラムと営業資料を当社からご提供しますので、IT・SaaS の販売経験があれば十分にスタート可能です。"
          />
          <FAQItem
            question="既に他の SaaS 代理店をしていますが、併用できますか？"
            answer="はい、競合関係になければ問題ありません。施工業界向けのソリューションとの相性が特に良いです。"
          />
          <FAQItem
            question="コミッション率の交渉は可能ですか？"
            answer="標準条件は固定ですが、大規模パートナー様や独占エリア提案がある場合は、個別に条件交渉が可能です。お問い合わせください。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="紹介を、業界の標準作りに。"
        subtitle="まずはパートナー資料をダウンロード。詳細は個別にご案内します。"
        primaryLabel="パートナー申請"
        primaryHref="/contact?role=agent"
        secondaryLabel="代理店向け資料"
        secondaryHref="/resources"
        tertiaryLabel="お問い合わせ"
        tertiaryHref="/contact"
        trackLocation="for-agents-final"
      />
    </>
  );
}
