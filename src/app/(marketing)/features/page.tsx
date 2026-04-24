import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { FourPortalDiagram } from "@/components/marketing/diagrams/FourPortalDiagram";
import { FEATURE_GROUPS as groups } from "@/lib/marketing/features";

export const metadata = {
  title: "機能一覧",
  description:
    "施工店・代理店・保険会社・顧客の4者をつなぐWEB施工証明書SaaS。証明書発行・車両管理・POS・帳票・分析まで一気通貫。",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        badge="FEATURES"
        title="記録と信頼を、一つのプラットフォームで。"
        subtitle="施工の記録から、保険・代理店・顧客との連携、経営分析まで。Ledra の全機能を、役割横断でご紹介します。"
      />

      {/* Anchor navigation */}
      <Section bg="alt" className="!py-12 md:!py-16">
        <nav className="flex flex-wrap justify-center gap-2" aria-label="機能カテゴリー">
          {groups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/[0.07] hover:text-white hover:border-white/[0.14] transition-colors"
            >
              {g.title}
            </a>
          ))}
        </nav>
      </Section>

      {/* 4ポータルの全体像 */}
      <Section>
        <SectionHeading
          title="ひとつの記録を、4ポータルで共有"
          subtitle="施工店・代理店・保険会社・顧客は、同じ『事実』を役割に応じた最適な形で受け取ります。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-8">
            <FourPortalDiagram className="w-full h-auto" />
          </div>
        </ScrollReveal>
      </Section>

      {groups.map((g, idx) => (
        <Section key={g.id} id={g.id} bg={idx % 2 === 0 ? "white" : "alt"}>
          <SectionHeading title={g.title} subtitle={g.subtitle} />
          <FeatureGrid className="mt-10">
            {g.features.map((f, i) => (
              <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 50} />
            ))}
          </FeatureGrid>
        </Section>
      ))}

      <CTABanner
        title="機能の全体像を、資料でまとめてお送りします"
        subtitle="詳細なユースケース・ロードマップ・他社比較も含めた資料を無料でダウンロードいただけます。"
        primaryLabel="資料ダウンロード"
        primaryHref="/resources"
        secondaryLabel="デモを見る"
        secondaryHref="/contact"
      />
    </>
  );
}
