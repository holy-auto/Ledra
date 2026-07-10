import { Hero } from "@/components/marketing/Hero";
import { CTAButton } from "@/components/marketing/CTAButton";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingCard } from "@/components/marketing/PricingCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { NarrativeTypewriter } from "@/components/marketing/NarrativeTypewriter";
import { Container } from "@/components/marketing/Container";
import { IntegrationLogoWall } from "@/components/marketing/IntegrationLogoWall";
import { MobileAppSection } from "@/components/marketing/MobileAppSection";
import { NewsTeaser } from "@/components/marketing/NewsTeaser";
import { GrowthJourney } from "@/components/marketing/GrowthJourney";
import { NetworkPreviewSection } from "@/components/marketing/NetworkPreviewSection";
import { TrustSecuritySection } from "@/components/marketing/TrustSecuritySection";
import { CustomerCasesSection } from "@/components/marketing/CustomerCasesSection";
import { CustomerSuccessSection } from "@/components/marketing/CustomerSuccessSection";
import { LedgerScaleSection } from "@/components/marketing/LedgerScaleSection";
import { WhatYouCanDoSection } from "@/components/marketing/WhatYouCanDoSection";
import { MediaAwardsRow } from "@/components/marketing/MediaAwardsRow";
import { FeatureCatalogSection } from "@/components/marketing/FeatureCatalogSection";
import { IndustryEntries } from "@/components/marketing/IndustryEntries";
import { CommunityEducationSection } from "@/components/marketing/CommunityEducationSection";
import { QuickStartReliabilityBar } from "@/components/marketing/QuickStartReliabilityBar";
import { PLANS } from "@/lib/marketing/pricing";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledra | WEB施工証明書SaaS",
  description:
    "施工証明をデジタルで。施工店・代理店・保険会社をつなぐマルチテナント SaaS。" +
    "ブロックチェーン・アンカリング・電子署名・QR 公開・モバイル NFC 連携を一本化。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Ledra | WEB施工証明書SaaS",
    description:
      "施工店・代理店・保険会社をつなぐマルチテナント SaaS。" +
      "ブロックチェーン・アンカリング、電子署名、QR、NFC を一本化。",
    url: "/",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ledra | WEB施工証明書SaaS",
    description: "施工証明をデジタルで。施工店と保険会社をつなぐ WEB SaaS。",
  },
};

export default async function HomePage() {
  return (
    <>
      {/* Hero */}
      <Hero />

      {/* Ledra でできること — 旧: 課題提起 / 解決 / 流れ / エコシステム / 証明書プレビュー を統合 */}
      <WhatYouCanDoSection />

      {/* すべて実数 — 本番DBの実数を隠さず見せる（履歴に嘘をつかせないブランドの幹） */}
      <Suspense>
        <GrowthJourney />
      </Suspense>

      {/* ターゲット別導線 */}
      <Section id="usecases">
        <SectionHeading
          title="あなたの立場に合わせた活用方法"
          subtitle="それぞれに最適な機能と導線をご用意しています"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 max-w-4xl mx-auto">
          <ScrollReveal variant="fade-up" delay={0}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10 h-full flex flex-col">
              <div className="text-xs font-medium text-blue-400 uppercase tracking-widest">施工店の方</div>
              <h3 className="mt-3 text-xl font-bold text-white">あなたの技術を、証明書にする。</h3>
              <ul className="mt-6 space-y-3 flex-1">
                {[
                  "テンプレートでかんたん発行",
                  "顧客へのURL共有・QR対応",
                  "発行履歴の一元管理",
                  "自社ブランドの証明書",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 bg-white text-[#060a12] hover:bg-gray-100 transition-colors"
                >
                  プランを見る
                </Link>
                <Link
                  href="/for-shops"
                  className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white hover:text-white hover:border-white/40 transition-colors"
                >
                  詳しく見る
                </Link>
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={150}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10 h-full flex flex-col">
              <div className="text-xs font-medium text-violet-400 uppercase tracking-widest">保険会社の方</div>
              <h3 className="mt-3 text-xl font-bold text-white">査定に、施工品質という判断軸を。</h3>
              <ul className="mt-6 space-y-3 flex-1">
                {[
                  "URLで施工内容を即時確認",
                  "改ざん防止でデータの信頼性担保",
                  "CSV一括エクスポート",
                  "既存システムとのAPI連携",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white">
                    <svg
                      className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 bg-white text-[#060a12] hover:bg-gray-100 transition-colors"
                >
                  デモを依頼
                </Link>
                <Link
                  href="/for-insurers"
                  className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white hover:text-white hover:border-white/40 transition-colors"
                >
                  詳しく見る
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* 代理店・オーナー向けリンク */}
        <ScrollReveal variant="fade-in" delay={300}>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <Link href="/for-agents" className="text-white hover:text-white transition-colors">
              代理店の方 — 信頼のネットワークを、一緒に広げる &rarr;
            </Link>
          </div>
        </ScrollReveal>
      </Section>

      {/* 台帳深掘り — 車両 / 顧客一覧で「現場のスケール感」を見せる */}
      <LedgerScaleSection />

      {/* 機能カタログ — 「全機能の網羅性」を圧縮して見せる */}
      <FeatureCatalogSection />

      {/* 連携パートナー — 既存の道具と無理なくつながる */}
      <IntegrationLogoWall />

      {/* モバイル訴求 — 現場の速度で */}
      <MobileAppSection />

      {/* セキュリティ・改ざん防止の根拠を、技術として開示 */}
      <TrustSecuritySection />

      {/* 大手企業向け PoC 導線 */}
      <Section bg="alt">
        <ScrollReveal variant="fade-up">
          <div className="mx-auto flex max-w-4xl flex-col items-start gap-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-blue-300">For Enterprise</div>
              <h3 className="mt-3 text-xl font-bold text-white">メーカー・保険会社・大手流通の方へ</h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/90">
                改ざん不可能な施工履歴を、貴社の査定・保証・流通の業務で検証する
                PoC（概念実証）プログラムを受付中です。NDA 締結のうえ、約10週間で検証できます。
              </p>
            </div>
            <CTAButton variant="outline" href="/poc-program" trackLocation="home-enterprise" className="shrink-0">
              PoC プログラムを見る &rarr;
            </CTAButton>
          </div>
        </ScrollReveal>
      </Section>

      {/* ユースケース */}
      <Section bg="alt" id="compare">
        <SectionHeading title="ご利用シーン" subtitle="さまざまな場面でLedraをご活用いただけます" />
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

      {/* 業態別 LP 導線 */}
      <IndustryEntries />

      {/* 顧客事例 (実名 × 数値効果 / 0件時は最初の1社募集) */}
      <Suspense>
        <CustomerCasesSection />
      </Suspense>

      {/* メディア掲載・受賞 (Coming soon 枠) */}
      <MediaAwardsRow />

      {/* ネットワークの広がり — 点と線で見る証明書・施工店・メーカー・保険会社・ユーザー */}
      <Suspense>
        <NetworkPreviewSection />
      </Suspense>

      {/* カスタマーサクセス・伴走 */}
      <CustomerSuccessSection />

      {/* コミュニティ・教育・イベント */}
      <CommunityEducationSection />

      {/* ブランドストーリー — 機能紹介を一通り見た読者へのクロージング */}
      <section className="relative bg-[#060a12] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse 90% 70% at 50% 50%, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 50%, black 30%, transparent 80%)",
          }}
        />
        <Container className="relative py-24 md:py-32">
          <NarrativeTypewriter />
        </Container>
      </section>

      {/* Quick Start + Reliability */}
      <QuickStartReliabilityBar />

      {/* 料金概要 */}
      <Section bg="alt" id="pricing">
        <SectionHeading title="料金プラン" subtitle="シンプルな料金体系で、すぐに始められます" />
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
            name={PLANS.starter.name}
            price={PLANS.starter.price}
            unit={PLANS.starter.unit}
            description={PLANS.starter.description}
            delay={100}
            features={[...PLANS.starter.features]}
          />
          <PricingCard
            name={PLANS.standard.name}
            price={PLANS.standard.price}
            unit={PLANS.standard.unit}
            setupFee={PLANS.standard.setupFee}
            description={PLANS.standard.description}
            delay={200}
            features={[...PLANS.standard.features]}
            recommended
          />
          <PricingCard
            name={PLANS.pro.name}
            price={PLANS.pro.price}
            unit={PLANS.pro.unit}
            setupFee={PLANS.pro.setupFee}
            description={PLANS.pro.description}
            delay={300}
            features={[...PLANS.pro.features]}
            ctaLabel={PLANS.pro.ctaLabel}
            ctaHref="/contact"
          />
        </PricingCards>
        <ScrollReveal variant="fade-in" delay={400}>
          <p className="text-center mt-8">
            <Link href="/pricing" className="text-sm font-medium text-blue-400 hover:underline">
              料金の詳細を見る &rarr;
            </Link>
          </p>
        </ScrollReveal>
      </Section>

      {/* お知らせ — 最新3件（空時は非表示） */}
      <Suspense>
        <NewsTeaser />
      </Suspense>

      {/* FAQ抜粋 */}
      <Section id="faq">
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="無料プランでも証明書の発行はできますか？"
            answer={`はい、無料プランでも${PLANS.free.certLimitShort}まで証明書を発行いただけます。まずは無料プランでお試しいただき、必要に応じてアップグレードをご検討ください。`}
          />
          <FAQItem
            question="導入にあたって特別な設備やソフトウェアは必要ですか？"
            answer="いいえ、LedraはWebブラウザのみで利用できます。特別なソフトウェアのインストールは不要で、インターネット環境があればすぐにご利用開始いただけます。"
          />
          <FAQItem
            question="保険会社側でアカウント登録は必要ですか？"
            answer="証明書の閲覧のみであればアカウント登録は不要です。URLからそのまま内容を確認できます。検索やエクスポートなどの機能をご利用の場合は、保険会社向けアカウントをご用意しています。"
          />
          <FAQItem
            question="既存のシステムと連携できますか？"
            answer="プロプランでは、API連携によるデータ連携が可能です。詳しくはお問い合わせください。"
          />
        </FAQList>
        <ScrollReveal variant="fade-in" delay={200}>
          <p className="text-center mt-8">
            <Link href="/faq" className="text-sm font-medium text-blue-400 hover:underline">
              すべてのFAQを見る &rarr;
            </Link>
          </p>
        </ScrollReveal>
      </Section>

      {/* 最終CTA — 3本足 */}
      <CTABanner
        title="記録を、業界の共通言語にする。"
        subtitle="まずは無料で、現場の技術を可視化してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
        tertiaryLabel="デモを見る"
        tertiaryHref="/demo"
        trackLocation="home-final"
      />
    </>
  );
}
