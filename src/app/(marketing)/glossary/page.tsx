import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { CTABanner } from "@/components/marketing/CTABanner";
import { GLOSSARY_CATEGORIES, listGlossaryByCategory } from "@/lib/marketing/glossary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "用語集 ── 施工・整備・保険・デジタル証明の用語",
  description:
    "コーティング・PPF・板金塗装・膜厚・修復歴・ブロックチェーン・電子署名など、施工証明にまつわる用語をやさしく解説。「〇〇とは」を調べたい方へ。",
  alternates: { canonical: "/glossary" },
  openGraph: {
    title: "用語集 | Ledra",
    description: "施工・整備・保険・デジタル証明の用語をやさしく解説する用語集。",
    url: "/glossary",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
};

export default function GlossaryPage() {
  const groups = listGlossaryByCategory();

  return (
    <>
      <Breadcrumbs items={[{ name: "用語集", url: "/glossary" }]} />
      <PageHero
        badge="GLOSSARY"
        title="施工と証明の、ことばの辞典。"
        subtitle="コーティングや板金、保険査定、ブロックチェーンまで──現場とデジタル証明にまつわる用語を、専門用語ゼロでやさしく解説します。"
      />

      {/* カテゴリ内アンカーナビ */}
      <Section bg="alt" className="!py-12 md:!py-16">
        <nav className="flex flex-wrap justify-center gap-2" aria-label="用語カテゴリー">
          {groups.map(({ category }) => (
            <a
              key={category}
              href={`#${category}`}
              className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white transition-colors hover:border-white/[0.14] hover:bg-white/[0.07]"
            >
              {GLOSSARY_CATEGORIES[category].label}
            </a>
          ))}
        </nav>
      </Section>

      {groups.map(({ category, terms }, gi) => (
        <Section key={category} id={category} bg={gi % 2 === 0 ? "white" : "alt"}>
          <div className="mx-auto max-w-4xl">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white md:text-2xl">{GLOSSARY_CATEGORIES[category].label}</h2>
              <p className="mt-2 text-sm text-white/70">{GLOSSARY_CATEGORIES[category].description}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {terms.map((t, i) => (
                <FeatureCard
                  key={t.slug}
                  variant="bordered"
                  delay={(i % 2) * 80}
                  title={t.term}
                  description={t.short}
                  href={`/glossary/${t.slug}`}
                />
              ))}
            </div>
          </div>
        </Section>
      ))}

      <CTABanner
        title="ことばの先の、実物を。"
        subtitle="用語を理解したら、実際の証明書を無料で発行して手ざわりを確かめてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧を見る"
        secondaryHref="/features"
        trackLocation="glossary-final"
      />
    </>
  );
}
