import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingCard } from "@/components/marketing/PricingCard";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import {
  PLANS,
  FEATURE_COMPARISON,
  ADD_ON_OPTIONS,
  TEMPLATE_OPTIONS,
  ANNUAL_DISCOUNT_PERCENT,
  LAUNCH_CAMPAIGN,
} from "@/lib/marketing/pricing";

export const metadata = {
  title: "料金プラン",
  description: "Ledraの料金プラン。フリーからプロまで、施工店の規模に合わせた4つのプランをご用意。",
};

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <Section bg="white">
        <SectionHeading
          title="シンプルで透明な料金体系"
          subtitle="施工店の規模に合わせた4つのプラン。まずは無料から始められます。"
        />

        {/* Campaign banner */}
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-center text-sm">
            <span className="font-semibold text-amber-400">{LAUNCH_CAMPAIGN.description}</span>
          </div>
        </ScrollReveal>

        {/* Plan cards */}
        <PricingCards className="mt-12">
          {Object.values(PLANS).map((plan) => (
            <PricingCard
              key={plan.name}
              name={plan.name}
              price={plan.price}
              unit={plan.unit}
              description={plan.description}
              features={[...plan.features]}
              recommended={"recommended" in plan && plan.recommended === true}
            />
          ))}
        </PricingCards>

        <p className="mt-6 text-center text-sm text-muted">
          年間契約で{ANNUAL_DISCOUNT_PERCENT}%OFF。全プラン税別価格です。
        </p>
      </Section>

      {/* Feature comparison */}
      <Section bg="alt">
        <SectionHeading title="プラン機能比較" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-4xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="py-3 pr-4 text-left font-medium text-muted">機能</th>
                  {Object.values(PLANS).map((p) => (
                    <th key={p.name} className="px-4 py-3 text-center font-semibold text-primary">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-border-subtle/50">
                    <td className="py-3 pr-4 text-secondary">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-muted">{row.free}</td>
                    <td className="px-4 py-3 text-center text-muted">{row.starter}</td>
                    <td className="px-4 py-3 text-center text-muted">{row.standard}</td>
                    <td className="px-4 py-3 text-center text-muted">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </Section>

      {/* Add-ons */}
      <Section bg="white">
        <SectionHeading title="オプション" subtitle="必要に応じて追加できるオプション機能" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 grid max-w-3xl gap-4">
            {Object.values(ADD_ON_OPTIONS).map((opt) => (
              <div key={opt.name} className="glass-card flex items-center justify-between p-4">
                <span className="font-medium text-primary">{opt.name}</span>
                <span className="text-sm text-accent">
                  {opt.price}
                  <span className="text-muted">{opt.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* Branded certificate options */}
      <Section bg="alt">
        <SectionHeading title="ブランド証明書オプション" subtitle="自社ブランドの施工証明書を発行" />
        <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
          {Object.values(TEMPLATE_OPTIONS).map((opt) => (
            <ScrollReveal key={opt.name} variant="fade-up">
              <div className={`glass-card p-6 ${"recommended" in opt && opt.recommended ? "ring-1 ring-accent" : ""}`}>
                <h3 className="text-lg font-semibold text-primary">{opt.name}</h3>
                <p className="mt-1 text-sm text-muted">{opt.description}</p>
                <div className="mt-4">
                  <span className="text-2xl font-bold text-primary">{opt.price}</span>
                  <span className="text-sm text-muted">/{opt.unit}</span>
                  <span className="ml-3 text-sm text-muted">初期費用 {opt.setupFee}</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {opt.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-secondary">
                      <span className="mt-1 text-accent">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section bg="white">
        <SectionHeading title="よくある質問" />
        <FAQList className="mt-10">
          <FAQItem
            question="無料プランに期間制限はありますか？"
            answer="いいえ。フリープランは期間無制限で月10件まで発行いただけます。"
          />
          <FAQItem
            question="途中でプラン変更できますか？"
            answer="はい。いつでもアップグレード・ダウングレードが可能です。日割り計算で差額を調整します。"
          />
          <FAQItem
            question="解約に違約金はかかりますか？"
            answer="いいえ。月額プランはいつでも解約可能で、違約金はありません。年間プランは残存期間の返金はございません。"
          />
          <FAQItem
            question="支払い方法は何がありますか？"
            answer="クレジットカード（Visa/Master/Amex/JCB）に対応しています。年間契約は請求書払いにも対応可能です。"
          />
        </FAQList>
      </Section>

      <CTABanner />
    </>
  );
}
