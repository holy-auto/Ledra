import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { StatsRow } from "@/components/marketing/StatsRow";
import { StatCard } from "@/components/marketing/StatCard";
import { LogoCloud } from "@/components/marketing/LogoCloud";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingCard } from "@/components/marketing/PricingCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { getMarketingStats } from "@/lib/marketing/stats";
import { PLANS } from "@/lib/marketing/pricing";
import Link from "next/link";

export default async function HomePage() {
  const stats = await getMarketingStats();
  return (
    <>
      {/* Hero */}
      <Hero />

      {/* 課題提起 */}
      <Section bg="alt">
        <SectionHeading
          title="こんな課題、ありませんか？"
          subtitle="施工証明の管理には、多くの非効率が残されています"
        />
        <FeatureGrid>
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            title="紙・PDFでの管理"
            description="施工証明書を紙やPDFで作成・保管しており、検索や共有に時間がかかる。紛失リスクもある。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="確認作業の非効率"
            description="保険会社が施工内容を確認する際、電話やFAXでのやり取りが発生し、双方に負担がかかっている。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            title="証明の信頼性"
            description="施工内容の真正性を客観的に証明する手段がなく、保険査定時に情報の正確性を担保しにくい。"
          />
        </FeatureGrid>
      </Section>

      {/* CARTRUSTの解決方法 */}
      <Section>
        <SectionHeading
          title="CARTRUSTが解決します"
          subtitle="デジタル施工証明書で、施工店と保険会社の業務を変えます"
        />
        <FeatureGrid>
          <FeatureCard
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="WEB上で証明書を発行"
            description="施工内容を入力するだけで、デジタル施工証明書をかんたんに発行。テンプレートで統一された品質を保てます。"
          />
          <FeatureCard
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            }
            title="URLで即時共有"
            description="発行した証明書はURLで共有可能。保険会社はリンクひとつで施工内容を確認でき、やり取りの手間を削減します。"
          />
          <FeatureCard
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            title="改ざん防止と信頼性"
            description="発行された証明書は改ざんできない仕組みで管理。保険会社が安心して査定に活用できる信頼性を提供します。"
          />
        </FeatureGrid>
      </Section>

      {/* 施工店向けメリット */}
      <Section bg="alt">
        <SectionHeading
          title="施工店の方へ"
          subtitle="業務効率化と顧客満足度の向上を同時に実現します"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            title="証明書作成の時間を削減"
            description="テンプレートに沿って入力するだけ。手書きやExcelでの作成から解放され、1件あたりの作成時間を大幅に短縮します。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="顧客への信頼感を向上"
            description="デジタル証明書の発行により、施工品質の見える化を実現。顧客からの信頼獲得と、リピート率の向上につながります。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
            title="証明書の一元管理"
            description="過去の発行履歴をすべてクラウドで管理。検索・再発行・エクスポートがいつでも可能です。"
          />
          <FeatureCard
            variant="bordered"
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            title="保険会社との連携強化"
            description="保険会社が直接証明書を確認できるため、問い合わせ対応が不要に。スムーズな連携で双方の業務負荷を軽減します。"
          />
        </div>
      </Section>

      {/* 保険会社向けメリット */}
      <Section>
        <SectionHeading
          title="保険会社の方へ"
          subtitle="査定業務の効率化と、施工情報の信頼性向上を支援します"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
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
            title="データの信頼性"
            description="改ざん防止の仕組みにより、施工データの正確性を担保。査定判断の精度向上に貢献します。"
          />
          <FeatureCard
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            }
            title="一括エクスポート"
            description="複数の証明書データをCSV形式で一括エクスポート。既存の社内システムとの連携もスムーズです。"
          />
          <FeatureCard
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            title="査定業務の効率化"
            description="施工情報の確認にかかる時間を短縮し、査定プロセス全体のスピードアップを実現します。"
          />
        </div>
      </Section>

      {/* ユースケース */}
      <Section bg="alt">
        <SectionHeading
          title="ご利用シーン"
          subtitle="さまざまな場面でCARTRUSTをご活用いただけます"
        />
        <FeatureGrid>
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
              </svg>
            }
            title="コーティング施工後の証明"
            description="ボディコーティングやガラスコーティングの施工完了後に、施工内容・使用材料・保証期間を記載した証明書を発行。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            }
            title="保険査定時のエビデンス"
            description="保険会社が車両の施工履歴を確認する際のエビデンスとして活用。デジタルデータで迅速な査定をサポート。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            title="中古車売買時の付加価値"
            description="施工証明書を車両の付加価値として提示。買い手への信頼感醸成と、中古車の適正評価に貢献します。"
          />
        </FeatureGrid>
      </Section>

      {/* 信頼要素 */}
      <Section>
        <SectionHeading title="多くの企業にご利用いただいています" />
        <StatsRow>
          <StatCard value={stats.shopCount} label="導入企業数" delay={0} />
          <StatCard value={stats.certificateCount} label="証明書発行数" delay={150} />
        </StatsRow>
        <LogoCloud />
      </Section>

      {/* 料金概要 */}
      <Section bg="alt">
        <SectionHeading
          title="料金プラン"
          subtitle="シンプルな料金体系で、すぐに始められます"
        />
        <PricingCards>
          <PricingCard
            name={PLANS.free.name}
            price={PLANS.free.price}
            unit={PLANS.free.unit}
            description={PLANS.free.description}
            delay={0}
            features={[...PLANS.free.features]}
            ctaLabel={PLANS.free.ctaLabel}
          />
          <PricingCard
            name={PLANS.standard.name}
            price={PLANS.standard.price}
            unit={PLANS.standard.unit}
            description={PLANS.standard.description}
            delay={100}
            features={[...PLANS.standard.features]}
            recommended
          />
          <PricingCard
            name={PLANS.pro.name}
            price={PLANS.pro.price}
            unit={PLANS.pro.unit}
            description={PLANS.pro.description}
            delay={200}
            features={[...PLANS.pro.features]}
            ctaLabel={PLANS.pro.ctaLabel}
          />
        </PricingCards>
        <ScrollReveal variant="fade-in" delay={400}>
          <p className="text-center mt-8">
            <Link
              href="/pricing"
              className="text-sm font-medium text-primary hover:underline"
            >
              料金の詳細を見る &rarr;
            </Link>
          </p>
        </ScrollReveal>
      </Section>

      {/* FAQ抜粋 */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="無料プランでも証明書の発行はできますか？"
            answer={`はい、無料プランでも${PLANS.starter.certLimitShort}まで証明書を発行いただけます。まずは無料プランでお試しいただき、必要に応じてアップグレードをご検討ください。`}
          />
          <FAQItem
            question="導入にあたって特別な設備やソフトウェアは必要ですか？"
            answer="いいえ、CARTRUSTはWebブラウザのみで利用できます。特別なソフトウェアのインストールは不要で、インターネット環境があればすぐにご利用開始いただけます。"
          />
          <FAQItem
            question="保険会社側でアカウント登録は必要ですか？"
            answer="証明書の閲覧のみであればアカウント登録は不要です。URLからそのまま内容を確認できます。検索やエクスポートなどの機能をご利用の場合は、保険会社向けアカウントをご用意しています。"
          />
          <FAQItem
            question="既存のシステムと連携できますか？"
            answer="エンタープライズプランでは、API連携によるデータ連携が可能です。詳しくはお問い合わせください。"
          />
        </FAQList>
        <ScrollReveal variant="fade-in" delay={200}>
          <p className="text-center mt-8">
            <Link
              href="/faq"
              className="text-sm font-medium text-primary hover:underline"
            >
              すべてのFAQを見る &rarr;
            </Link>
          </p>
        </ScrollReveal>
      </Section>

      {/* 最終CTA */}
      <CTABanner />
    </>
  );
}
