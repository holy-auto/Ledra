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
import { Container } from "@/components/marketing/Container";
import { getMarketingStats } from "@/lib/marketing/stats";
import { PLANS } from "@/lib/marketing/pricing";
import Link from "next/link";

export default async function HomePage() {
  const stats = await getMarketingStats();
  return (
    <>
      {/* Hero */}
      <Hero />

      {/* ブランドストーリー — ナラティブ進行 */}
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
          <div className="max-w-3xl mx-auto">
            {/* 導入 — 現場の課題 */}
            <ScrollReveal variant="fade-up">
              <div className="space-y-5 text-[1.125rem] md:text-[1.25rem] leading-[1.85] text-white/50">
                <p>腕のいい職人がいる。丁寧な仕事をしている。</p>
                <p>でも、その技術は施工が終わった瞬間に見えなくなる。</p>
                <p className="text-white/35">
                  写真は個人のスマホに埋もれ、記録は紙のファイルに閉じられ、
                  <br className="hidden md:block" />
                  品質の証明は、口約束と経験則に頼っている。
                </p>
              </div>
            </ScrollReveal>

            {/* 転換 — 問いかけ */}
            <ScrollReveal variant="fade-up" delay={200}>
              <div className="mt-16 md:mt-20 space-y-4 text-[1.125rem] md:text-[1.25rem] leading-[1.85] text-white/60">
                <p>もし、一件一件の施工が「証明」として残ったら。</p>
                <p>もし、その証明が施工店の信用になったら。</p>
                <p>もし、その信用が保険査定や顧客選択の判断材料になったら。</p>
              </div>
            </ScrollReveal>

            <ScrollReveal variant="fade-up" delay={400}>
              <p className="mt-12 md:mt-16 text-[1.25rem] md:text-[1.5rem] font-bold leading-[1.6] text-white">
                現場の技術は、もっと正しく評価されるはずだ。
              </p>
            </ScrollReveal>

            {/* チェーン — 記録→証明→信頼→業界基盤 */}
            <ScrollReveal variant="fade-up" delay={600}>
              <div className="mt-20 md:mt-24 flex flex-col gap-0">
                {[
                  "一件の施工記録が、証明になる。",
                  "証明が、信頼になる。",
                  "信頼が、つながりになる。",
                  "つながりが、業界の基盤になる。",
                ].map((line, i) => (
                  <div key={i} className="flex items-center gap-4 py-3">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-violet-400 flex-shrink-0" />
                    <span className="text-[1.125rem] md:text-[1.25rem] font-medium text-white/70">{line}</span>
                  </div>
                ))}
              </div>
            </ScrollReveal>

            <ScrollReveal variant="fade-up" delay={800}>
              <p className="mt-12 text-[1.375rem] md:text-[1.75rem] font-bold tracking-tight bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent bg-[length:200%_auto]">
                記録を、業界の共通言語にする。
              </p>
            </ScrollReveal>
          </div>
        </Container>
      </section>

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
      <Section id="features">
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

      {/* Ledraエコシステム */}
      <Section id="ecosystem">
        <SectionHeading title="Ledraのエコシステム" subtitle="記録から始まり、業界全体へ広がるプラットフォーム" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              name: "Ledra Cert",
              label: "中核プロダクト",
              description: "施工証明書の発行・履歴管理。施工の品質を可視化し、信頼の起点をつくる。",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ),
            },
            {
              name: "Ledra Connect",
              label: "デバイス連携",
              description: "IoTデバイスと施工現場をつなぎ、記録の自動化と正確性を高める。",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                </svg>
              ),
            },
            {
              name: "Ledra Hub",
              label: "ネットワーク連携",
              description: "加盟店・顧客・保険会社をひとつのネットワークに。信頼のつながりを構築する。",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ),
            },
            {
              name: "Ledra Standard",
              label: "業界基準",
              description: "施工品質の共通基準と認定制度。業界全体の信頼性を底上げする。",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ),
            },
            {
              name: "Ledra Academy",
              label: "技術育成",
              description: "次世代の技術者を育成し、技術の継承と業界の持続的な発展を支える。",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                </svg>
              ),
            },
          ].map((item, i) => (
            <ScrollReveal key={item.name} variant="fade-up" delay={i * 80}>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 hover:bg-white/[0.06] hover:border-white/[0.14] transition-all duration-300 h-full group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{item.name}</div>
                    <div className="text-[0.6875rem] text-white/35">{item.label}</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-white/50">{item.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
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
                    <div className="mt-1 text-white/70">2026.03.15</div>
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
              <h3 className="mt-3 text-xl font-bold text-white">査定に、施工品質という判断軸を。</h3>
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

        {/* 代理店・オーナー向けリンク */}
        <ScrollReveal variant="fade-in" delay={300}>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <Link href="/for-agents" className="text-white/40 hover:text-white/70 transition-colors">
              代理店の方 — 信頼のネットワークを、一緒に広げる &rarr;
            </Link>
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

      {/* 信頼要素 */}
      {(stats.shopCount !== "—" || stats.certificateCount !== "—") && (
        <Section>
          <SectionHeading title="ご利用状況" />
          <StatsRow>
            {stats.shopCount !== "—" && (
              <ScrollReveal variant="scale-up" delay={0}>
                <StatCard value={stats.shopCount} label="導入企業数" />
              </ScrollReveal>
            )}
            {stats.certificateCount !== "—" && (
              <ScrollReveal variant="scale-up" delay={150}>
                <StatCard value={stats.certificateCount} label="証明書発行数" />
              </ScrollReveal>
            )}
          </StatsRow>
        </Section>
      )}

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

      {/* 最終CTA */}
      <CTABanner
        title="記録を、業界の共通言語にする。"
        subtitle="Ledraで、現場の技術を可視化し、業界全体に信頼と価値を届けましょう。"
      />
    </>
  );
}
