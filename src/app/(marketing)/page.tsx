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

      {/* Trust Bar */}
      <div className="bg-[#060a12] border-y border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-6">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {[
              { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", label: "SSL暗号化" },
              { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "改ざん防止" },
              { icon: "M5 12h14M12 5l7 7-7 7", label: "即時発行" },
              { icon: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z", label: "クラウド管理" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4.5 h-4.5 text-blue-400/70">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span className="text-xs text-white/50 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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

      {/* 証明書発行の流れ */}
      <Section bg="alt">
        <SectionHeading
          title="証明書発行の流れ"
          subtitle="施工完了から証明書の共有まで、わずか数分で完了します"
        />
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
                  <p className="mt-2 text-white/60 leading-relaxed">{item.description}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* NFC訴求セクション */}
      <Section>
        <SectionHeading
          title="NFCタグで、証明書を車両と一体化"
          subtitle="スマートフォンをかざすだけで施工証明書を即座に確認"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  step: "1",
                  title: "NFCタグを車両に貼付",
                  description: "コンパクトなNFCタグを車両に取り付け。施工証明書と紐付けます。",
                  color: "cyan",
                },
                {
                  step: "2",
                  title: "スマートフォンでタッチ",
                  description: "誰でもスマートフォンをかざすだけ。専用アプリは不要です。",
                  color: "blue",
                },
                {
                  step: "3",
                  title: "証明書を即座に確認",
                  description: "施工内容・保証期間・施工店情報をその場で確認できます。",
                  color: "violet",
                },
              ].map((item) => (
                <div key={item.step} className="text-center p-8 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] transition-all duration-300">
                  <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center text-lg font-bold ${
                    item.color === "cyan"
                      ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
                      : item.color === "blue"
                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
                        : "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                  }`}>
                    {item.step}
                  </div>
                  <h3 className="mt-5 text-base font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/nfc"
                className="text-sm font-medium text-cyan-400 hover:underline"
              >
                NFCタグについて詳しく見る &rarr;
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </Section>

      {/* 証明書プレビュー */}
      <Section bg="alt">
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
                    <div className="text-xs text-white/40 uppercase tracking-widest">施工証明書</div>
                    <div className="mt-1 text-lg font-bold text-white">CARTRUST Certificate</div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-blue-400">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/40">車両</div>
                    <div className="mt-1 text-white/70">Toyota Alphard 2024</div>
                  </div>
                  <div>
                    <div className="text-white/40">施工日</div>
                    <div className="mt-1 text-white/70">2025.03.15</div>
                  </div>
                  <div>
                    <div className="text-white/40">施工内容</div>
                    <div className="mt-1 text-white/70">ボディコーティング</div>
                  </div>
                  <div>
                    <div className="text-white/40">保証期間</div>
                    <div className="mt-1 text-white/70">5年間</div>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-green-400">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-sm text-green-400/80">改ざん防止により真正性を担保</div>
                </div>
              </div>
            </div>
            <p className="mt-6 text-center text-sm text-white/40">
              自社ロゴ・ブランドカラーの反映、施工写真の添付にも対応
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* ターゲット別導線 */}
      <Section>
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
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/signup" className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 bg-white text-[#060a12] hover:bg-gray-100 transition-colors active:scale-[0.97]">
                  無料で始める
                </Link>
                <Link href="/for-shops" className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors active:scale-[0.97]">
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
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/contact" className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 bg-white text-[#060a12] hover:bg-gray-100 transition-colors active:scale-[0.97]">
                  デモを依頼
                </Link>
                <Link href="/for-insurers" className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors active:scale-[0.97]">
                  詳しく見る
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Section>

      {/* 信頼要素 */}
      {(stats.shopCount !== "—" || stats.certificateCount !== "—") && (
        <Section bg="alt">
          <SectionHeading title="ご利用状況" />
          <StatsRow>
            {stats.shopCount !== "—" && (
              <StatCard value={stats.shopCount} label="導入企業数" delay={0} />
            )}
            {stats.certificateCount !== "—" && (
              <StatCard value={stats.certificateCount} label="証明書発行数" delay={150} />
            )}
          </StatsRow>
        </Section>
      )}

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
            <Link
              href="/pricing"
              className="text-sm font-medium text-blue-400 hover:underline"
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
            answer={`はい、無料プランでも${PLANS.free.certLimitShort}まで証明書を発行いただけます。まずは無料プランでお試しいただき、必要に応じてアップグレードをご検討ください。`}
          />
          <FAQItem
            question="導入にあたって特別な設備やソフトウェアは必要ですか？"
            answer="いいえ、CARTRUSTはWebブラウザのみで利用できます。特別なソフトウェアのインストールは不要で、インターネット環境があればすぐにご利用開始いただけます。"
          />
          <FAQItem
            question="NFCタグとは何ですか？"
            answer="NFCタグは、スマートフォンをかざすだけで施工証明書を表示できる小型のタグです。車両に貼り付けることで、いつでも施工履歴を確認できます。専用アプリは不要です。"
          />
        </FAQList>
        <ScrollReveal variant="fade-in" delay={200}>
          <p className="text-center mt-8">
            <Link
              href="/faq"
              className="text-sm font-medium text-blue-400 hover:underline"
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
