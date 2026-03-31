import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { StatsRow } from "@/components/marketing/StatsRow";
import { StatCard } from "@/components/marketing/StatCard";
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

      {/* Ledraの解決方法 */}
      <Section>
        <SectionHeading title="Ledraが解決します" subtitle="デジタル施工証明書で、施工店と保険会社の業務を変えます" />
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

      {/* 証明書発行の流れ */}
      <Section bg="alt">
        <SectionHeading title="証明書発行の流れ" subtitle="施工完了から証明書の共有まで、わずか数分で完了します" />
        <div className="max-w-3xl mx-auto">
          {[
            {
              step: "01",
              title: "施工内容を入力",
              description: "車両情報・施工内容・使用材料をテンプレートに沿って入力。写真のアップロードも可能です。",
            },
            {
              step: "02",
              title: "証明書を発行",
              description: "内容を確認して発行。改ざん防止のデジタル証明書が即座に生成されます。",
            },
            {
              step: "03",
              title: "URLで顧客に共有",
              description: "発行された証明書のURLをメールやLINEで共有。QRコードにも対応しています。",
            },
            {
              step: "04",
              title: "保険会社が照会",
              description: "保険会社は専用ポータルから証明書を検索・確認。電話やFAXでのやり取りが不要になります。",
            },
          ].map((item, i) => (
            <ScrollReveal key={item.step} variant="fade-up" delay={i * 100}>
              <div className="flex gap-6 md:gap-8 items-start py-8 border-b border-white/[0.06] last:border-b-0">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <span className="text-lg font-bold text-blue-400">{item.step}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-white/50 leading-relaxed">{item.description}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* 実際に何が見えるか — 証明書プレビュー */}
      <Section>
        <SectionHeading
          title="発行される証明書のイメージ"
          subtitle="施工店のブランドを反映した、プロフェッショナルなデジタル証明書"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-white/30 uppercase tracking-widest">施工証明書</div>
                    <div className="mt-1 text-lg font-bold text-white">Ledra</div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-5 h-5 text-blue-400"
                    >
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/30">車両</div>
                    <div className="mt-1 text-white/70">Toyota Alphard 2024</div>
                  </div>
                  <div>
                    <div className="text-white/30">施工日</div>
                    <div className="mt-1 text-white/70">2025.03.15</div>
                  </div>
                  <div>
                    <div className="text-white/30">施工内容</div>
                    <div className="mt-1 text-white/70">ボディコーティング</div>
                  </div>
                  <div>
                    <div className="text-white/30">保証期間</div>
                    <div className="mt-1 text-white/70">5年間</div>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-4 h-4 text-green-400"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-sm text-green-400/80">改ざん防止により真正性を担保</div>
                </div>
              </div>
            </div>
            <p className="mt-6 text-center text-sm text-white/30">
              自社ロゴ・ブランドカラーの反映、施工写真の添付にも対応
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* ターゲット別導線 */}
      <Section bg="alt">
        <SectionHeading
          title="あなたの立場に合わせた活用方法"
          subtitle="施工店と保険会社、それぞれに最適な機能と導線をご用意しています"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 max-w-4xl mx-auto">
          <ScrollReveal variant="fade-up" delay={0}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10 h-full flex flex-col">
              <div className="text-xs font-medium text-blue-400 uppercase tracking-widest">施工店の方</div>
              <h3 className="mt-3 text-xl font-bold text-white">証明書発行で業務を効率化</h3>
              <ul className="mt-6 space-y-3 flex-1">
                {[
                  "テンプレートでかんたん発行",
                  "顧客へのURL共有・QR対応",
                  "発行履歴の一元管理",
                  "自社ブランドの証明書",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/60">
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
                  className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
                >
                  詳しく見る
                </Link>
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={150}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10 h-full flex flex-col">
              <div className="text-xs font-medium text-violet-400 uppercase tracking-widest">保険会社の方</div>
              <h3 className="mt-3 text-xl font-bold text-white">査定業務の精度と速度を向上</h3>
              <ul className="mt-6 space-y-3 flex-1">
                {[
                  "URLで施工内容を即時確認",
                  "改ざん防止でデータの信頼性担保",
                  "CSV一括エクスポート",
                  "既存システムとのAPI連携",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/60">
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
                  className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
                >
                  詳しく見る
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Section>

      {/* ユースケース */}
      <Section bg="alt">
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

      {/* 信頼要素 — DB統計が取得できた場合のみ表示 */}
      {(stats.shopCount !== "—" || stats.certificateCount !== "—") && (
        <Section>
          <SectionHeading title="ご利用状況" />
          <StatsRow>
            {stats.shopCount !== "—" && <StatCard value={stats.shopCount} label="導入企業数" delay={0} />}
            {stats.certificateCount !== "—" && (
              <StatCard value={stats.certificateCount} label="証明書発行数" delay={150} />
            )}
          </StatsRow>
        </Section>
      )}

      {/* 料金概要 */}
      <Section bg="alt">
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
            description={PLANS.standard.description}
            delay={200}
            features={[...PLANS.standard.features]}
            recommended
          />
          <PricingCard
            name={PLANS.pro.name}
            price={PLANS.pro.price}
            unit={PLANS.pro.unit}
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

      {/* FAQ抜粋 */}
      <Section>
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

      {/* 最終CTA */}
      <CTABanner />
    </>
  );
}
