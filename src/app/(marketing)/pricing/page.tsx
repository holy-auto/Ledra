import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingCard } from "@/components/marketing/PricingCard";
import { FeatureComparisonTable } from "@/components/marketing/FeatureComparisonTable";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { PLANS, FEATURE_COMPARISON, ANNUAL_DISCOUNT_PERCENT, TEMPLATE_OPTIONS, TEMPLATE_ADDITIONAL_WORK, TEMPLATE_FAQ, NFC_TAG_PRICING, LAUNCH_CAMPAIGN } from "@/lib/marketing/pricing";
import Link from "next/link";

export const metadata = {
  title: "料金プラン",
  description: "CARTRUSTの料金プラン。無料プランから始められ、規模に合わせてスケールできます。",
};

export default function PricingPage() {
  return (
    <>
      <PageHero
        badge="PRICING"
        title="シンプルで分かりやすい料金体系"
        subtitle="すべてのプランで基本機能をご利用いただけます。規模に合わせてお選びください。"
      />

      {/* キャンペーンバナー */}
      <Section>
        <ScrollReveal variant="fade-up">
          <div className="max-w-3xl mx-auto rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/[0.08] to-violet-500/[0.08] p-6 md:p-8 text-center mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/25 mb-3">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[pulse-soft_2s_ease-in-out_infinite]" />
              <span className="text-xs font-medium text-blue-300">CAMPAIGN</span>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white">
              {LAUNCH_CAMPAIGN.description}
            </h3>
            <p className="mt-2 text-sm text-white/65">
              NFC初回{LAUNCH_CAMPAIGN.nfcFreeAllocation}枚無料 · 請求書機能 {LAUNCH_CAMPAIGN.invoiceOptionPrice}/月
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* メインプラン */}
      <Section>
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
          />
        </PricingCards>
        <ScrollReveal variant="fade-in" delay={300}>
          <p className="text-center mt-6 text-sm text-white/55">
            年間契約で{ANNUAL_DISCOUNT_PERCENT}%オフ。詳しくはお問い合わせください。
          </p>
        </ScrollReveal>
      </Section>

      {/* 機能比較 */}
      <Section bg="alt">
        <SectionHeading
          title="プラン別機能比較"
          subtitle="各プランの詳細な機能一覧"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <FeatureComparisonTable rows={FEATURE_COMPARISON} />
        </ScrollReveal>
      </Section>

      {/* NFCタグ料金 */}
      <Section>
        <SectionHeading
          title="NFCタグ料金"
          subtitle="施工証明書を車両に紐づけるNFCタグのオプション"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="max-w-lg mx-auto">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-5 mb-6 text-center">
              <div className="text-xl font-bold text-cyan-400">
                初回{NFC_TAG_PRICING.freeAllocation}枚 無料
              </div>
              <p className="mt-1 text-sm text-white/65">
                アカウント作成時に無料でお届け
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                    <th className="text-left py-3 px-5 font-medium text-white/50">枚数</th>
                    <th className="text-right py-3 px-5 font-medium text-white/50">料金（税込）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {NFC_TAG_PRICING.packs.map((pack) => (
                    <tr key={pack.quantity} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 px-5 text-white">{pack.quantity}枚パック</td>
                      <td className="py-3 px-5 text-right text-white/65">{pack.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-center">
              <Link href="/nfc" className="text-sm font-medium text-cyan-400 hover:underline">
                NFCタグについて詳しく見る &rarr;
              </Link>
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* 料金FAQ */}
      <Section bg="alt">
        <SectionHeading title="料金に関するご質問" />
        <FAQList>
          <FAQItem
            question="無料プランから有料プランへの切り替えはいつでもできますか？"
            answer="はい、いつでもアップグレード可能です。無料プランでの発行データもそのまま引き継がれますので、安心してお切り替えいただけます。"
          />
          <FAQItem
            question="年間契約による割引はありますか？"
            answer={`はい、年間契約の場合は月額料金から${ANNUAL_DISCOUNT_PERCENT}%の割引が適用されます。詳しくはお問い合わせください。`}
          />
          <FAQItem
            question="月の発行数が上限を超えた場合はどうなりますか？"
            answer="上限に達した場合は追加発行ができなくなります。上位プランへのアップグレードをご検討いただくか、翌月までお待ちください。個別の追加発行オプションについてはお問い合わせください。"
          />
          <FAQItem
            question="解約手数料はかかりますか？"
            answer="解約手数料は一切かかりません。月額プランの場合、月末まではご利用いただけます。年間プランの場合は残期間分の返金はございませんのでご了承ください。"
          />
        </FAQList>
      </Section>

      {/* テンプレートオプション */}
      <Section>
        <SectionHeading
          title="ブランド証明書オプション"
          subtitle="自社ロゴ・ブランドカラーを反映した施工証明書を発行できるオプションです。基本プランに追加してご利用いただけます。"
        />
        <PricingCards>
          <PricingCard
            name={TEMPLATE_OPTIONS.preset.name}
            price={TEMPLATE_OPTIONS.preset.price}
            unit={TEMPLATE_OPTIONS.preset.unit}
            description={`${TEMPLATE_OPTIONS.preset.description}（初期費用 ${TEMPLATE_OPTIONS.preset.setupFee}）`}
            delay={0}
            features={[...TEMPLATE_OPTIONS.preset.features]}
          />
          <PricingCard
            name={TEMPLATE_OPTIONS.custom.name}
            price={TEMPLATE_OPTIONS.custom.price}
            unit={TEMPLATE_OPTIONS.custom.unit}
            description={`${TEMPLATE_OPTIONS.custom.description}（初期費用 ${TEMPLATE_OPTIONS.custom.setupFee}）`}
            delay={100}
            features={[...TEMPLATE_OPTIONS.custom.features]}
            recommended
          />
        </PricingCards>
      </Section>

      {/* 追加作業費 */}
      <Section bg="alt">
        <SectionHeading
          title="追加作業費"
          subtitle="テンプレート公開後の変更・追加は以下の料金にて承ります。"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl mx-auto text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left py-4 px-4 font-medium text-white/50">作業内容</th>
                  <th className="text-right py-4 px-4 font-medium text-white">料金（税込）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {TEMPLATE_ADDITIONAL_WORK.map((row) => (
                  <tr key={row.item} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 px-4 text-white">{row.item}</td>
                    <td className="py-3.5 px-4 text-right text-white/65">{row.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </Section>

      {/* テンプレートFAQ */}
      <Section>
        <SectionHeading title="ブランド証明書に関するご質問" />
        <FAQList>
          {TEMPLATE_FAQ.map((faq) => (
            <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </FAQList>
      </Section>

      <CTABanner
        title="まずは無料で始めましょう"
        subtitle="クレジットカード不要。5分で始められます。"
        primaryLabel="無料で始める"
        primaryHref="/signup"
        secondaryLabel="お問い合わせ"
      />
    </>
  );
}
