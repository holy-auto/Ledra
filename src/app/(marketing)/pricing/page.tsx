import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingCard } from "@/components/marketing/PricingCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

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
            name="スターター"
            price="無料"
            unit=""
            description="まずは試してみたい方に"
            delay={0}
            features={[
              "月5件まで証明書発行",
              "基本テンプレート",
              "URL共有",
              "メールサポート",
            ]}
            ctaLabel="無料で始める"
          />
          <PricingCard
            name="スタンダード"
            price="¥9,800"
            description="本格的に活用したい施工店に"
            delay={100}
            features={[
              "月100件まで証明書発行",
              "カスタムテンプレート",
              "ロゴ・ブランドカスタマイズ",
              "CSV/PDFエクスポート",
              "優先サポート",
            ]}
            recommended
          />
          <PricingCard
            name="エンタープライズ"
            price="要相談"
            unit=""
            description="大規模導入・API連携をお考えの方に"
            delay={200}
            features={[
              "無制限の証明書発行",
              "API連携",
              "専用アカウントマネージャー",
              "カスタム開発対応",
              "SLA保証",
            ]}
            ctaLabel="お問い合わせ"
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
            <table className="w-full max-w-4xl mx-auto text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-medium text-muted">機能</th>
                  <th className="text-center py-4 px-4 font-medium text-heading">スターター</th>
                  <th className="text-center py-4 px-4 font-medium text-primary">スタンダード</th>
                  <th className="text-center py-4 px-4 font-medium text-heading">エンタープライズ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  { feature: "証明書発行数", starter: "月5件", standard: "月100件", enterprise: "無制限" },
                  { feature: "テンプレート", starter: "基本", standard: "カスタム", enterprise: "完全カスタム" },
                  { feature: "ブランドカスタマイズ", starter: "—", standard: "✓", enterprise: "✓" },
                  { feature: "URL共有", starter: "✓", standard: "✓", enterprise: "✓" },
                  { feature: "CSV/PDFエクスポート", starter: "—", standard: "✓", enterprise: "✓" },
                  { feature: "API連携", starter: "—", standard: "—", enterprise: "✓" },
                  { feature: "サポート", starter: "メール", standard: "優先メール", enterprise: "専任マネージャー" },
                  { feature: "SLA保証", starter: "—", standard: "—", enterprise: "✓" },
                ].map((row) => (
                  <tr key={row.feature} className="hover:bg-surface-subtle/50 transition-colors">
                    <td className="py-3.5 px-4 text-heading font-medium">{row.feature}</td>
                    <td className="py-3.5 px-4 text-center text-body">{row.starter}</td>
                    <td className="py-3.5 px-4 text-center text-primary font-medium">{row.standard}</td>
                    <td className="py-3.5 px-4 text-center text-body">{row.enterprise}</td>
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
            answer="はい、年間契約の場合は月額料金から20%の割引が適用されます。詳しくはお問い合わせください。"
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

      <CTABanner
        title="まずは無料で始めましょう"
        subtitle="クレジットカード不要。5分で始められます。"
        primaryLabel="無料で始める"
        secondaryLabel="お問い合わせ"
      />
    </>
  );
}
