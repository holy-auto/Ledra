import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "保険会社の方へ",
  description: "CARTRUSTで施工証明書の確認・査定業務を効率化。データの信頼性向上と業務コスト削減を実現します。",
};

export default function ForInsurersPage() {
  return (
    <>
      <PageHero
        badge="FOR INSURERS"
        title="査定業務の精度と速度を、同時に向上"
        subtitle="施工証明書のデジタル化により、確認作業の効率化とデータの信頼性向上を実現します。"
      />

      {/* 主要メリット */}
      <Section>
        <SectionHeading
          title="CARTRUSTが保険会社にもたらす価値"
          subtitle="施工証明書の確認から査定まで、業務全体を効率化します"
        />
        <FeatureGrid>
          <FeatureCard
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            title="施工内容の即時確認"
            description="URLひとつで施工証明書にアクセス。電話やFAXを待つことなく、必要な情報をすぐに確認できます。"
          />
          <FeatureCard
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="データの信頼性を担保"
            description="改ざん防止の仕組みにより、施工データの正確性を担保。査定判断の精度向上に貢献します。"
          />
          <FeatureCard
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            title="査定業務の効率化"
            description="施工情報の確認にかかる時間を短縮し、査定プロセス全体のスピードアップを実現します。"
          />
        </FeatureGrid>
      </Section>

      {/* 導入効果 */}
      <Section bg="alt">
        <SectionHeading
          title="導入による効果"
          subtitle="数字で見るCARTRUSTの導入効果"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { value: "70%", label: "確認作業時間の削減", description: "電話・FAXでの確認作業が不要に" },
            { value: "99.9%", label: "データの正確性", description: "改ざん防止によるデータ信頼性" },
            { value: "50%", label: "査定コストの削減", description: "業務プロセス全体の効率化" },
          ].map((item, i) => (
            <ScrollReveal key={item.label} variant="scale-up" delay={i * 120}>
              <div className="text-center p-8 rounded-xl bg-white border border-border">
                <div className="text-3xl md:text-4xl font-bold text-primary">{item.value}</div>
                <div className="mt-2 text-sm font-medium text-heading">{item.label}</div>
                <div className="mt-1 text-xs text-muted">{item.description}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* 機能詳細 */}
      <Section>
        <SectionHeading
          title="保険会社向け機能"
          subtitle="査定業務に必要な機能を網羅しています"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            }
            title="一括エクスポート"
            description="複数の証明書データをCSV形式で一括エクスポート。既存の社内システムとの連携もスムーズです。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            }
            title="高度な検索・フィルタ"
            description="車両情報、施工日、施工店名など、多様な条件で証明書を検索。必要な情報に素早くアクセスできます。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
            title="セキュリティ・コンプライアンス"
            description="SSL暗号化、アクセスログ管理、IP制限など、企業レベルのセキュリティ要件に対応しています。"
          />
          <FeatureCard
            variant="bordered"
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            }
            title="API連携"
            description="エンタープライズプランでは、RESTful APIによる社内システムとの連携が可能。既存ワークフローに組み込めます。"
          />
        </div>
      </Section>

      <CTABanner
        title="査定業務の効率化を始めましょう"
        subtitle="まずはデモをご覧ください。導入のご相談も承ります。"
        primaryLabel="デモを依頼"
        secondaryLabel="お問い合わせ"
      />
    </>
  );
}
