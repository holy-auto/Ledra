import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingCard } from "@/components/marketing/PricingCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { PLANS, FEATURE_COMPARISON, ANNUAL_DISCOUNT_PERCENT, TEMPLATE_OPTIONS, TEMPLATE_ADDITIONAL_WORK, TEMPLATE_FAQ } from "@/lib/marketing/pricing";

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
            ctaLabel={PLANS.pro.ctaLabel}
            ctaHref="/contact"
          />
        </PricingCards>
      </Section>

      {/* 機能比較 */}
      <Section bg="alt">
        <SectionHeading
          title="プラン別機能比較"
          subtitle="各プランの詳細な機能一覧"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="overflow-x-auto">
            <table className="w-full max-w-5xl mx-auto text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left py-4 px-4 font-medium text-white/40">機能</th>
                  <th className="text-center py-4 px-4 font-medium text-white">フリー</th>
                  <th className="text-center py-4 px-4 font-medium text-white">スターター</th>
                  <th className="text-center py-4 px-4 font-medium text-blue-400">スタンダード</th>
                  <th className="text-center py-4 px-4 font-medium text-white">プロ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {FEATURE_COMPARISON.map((row) => (
                  <tr key={row.feature} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 px-4 text-white font-medium">{row.feature}</td>
                    <td className="py-3.5 px-4 text-center text-white/60">{row.free}</td>
                    <td className="py-3.5 px-4 text-center text-white/60">{row.starter}</td>
                    <td className="py-3.5 px-4 text-center text-blue-400 font-medium">{row.standard}</td>
                    <td className="py-3.5 px-4 text-center text-white/60">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </Section>

      {/* 料金FAQ */}
      <Section>
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
      <Section bg="alt">
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
      <Section>
        <SectionHeading
          title="追加作業費"
          subtitle="テンプレート公開後の変更・追加は以下の料金にて承ります。"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl mx-auto text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left py-4 px-4 font-medium text-white/40">作業内容</th>
                  <th className="text-right py-4 px-4 font-medium text-white">料金（税込）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {TEMPLATE_ADDITIONAL_WORK.map((row) => (
                  <tr key={row.item} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 px-4 text-white">{row.item}</td>
                    <td className="py-3.5 px-4 text-right text-white/60">{row.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </Section>

      {/* テンプレートFAQ */}
      <Section bg="alt">
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
