import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { FAQJsonLd } from "@/components/marketing/JsonLd";
import { SHOP_INDUSTRIES, getShopIndustry } from "@/lib/marketing/shopIndustries";
import { getGlossaryTerm } from "@/lib/marketing/glossary";

type Props = { params: Promise<{ industry: string }> };

// 業態は有限集合。不明な slug は 404。
export const dynamicParams = false;

export function generateStaticParams() {
  return SHOP_INDUSTRIES.map((i) => ({ industry: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry } = await params;
  const i = getShopIndustry(industry);
  if (!i) return { title: "Not Found" };
  const url = `/for-shops/${i.slug}`;
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${i.title} | Ledra`,
      description: i.description,
      url,
      siteName: "Ledra",
      locale: "ja_JP",
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ShopIndustryPage({ params }: Props) {
  const { industry } = await params;
  const i = getShopIndustry(industry);
  if (!i) notFound();

  const terms = i.glossary.map(getGlossaryTerm).filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <>
      <FAQJsonLd items={i.faqs} />
      <Breadcrumbs
        items={[
          { name: "施工店の方へ", url: "/for-shops" },
          { name: i.name, url: `/for-shops/${i.slug}` },
        ]}
      />
      <PageHero badge={`FOR SHOPS › ${i.name}`} title={i.heroTitle} subtitle={i.heroSubtitle} />

      <Section bg="alt">
        <SectionHeading title="こんなこと、ありませんか？" />
        <FeatureGrid className="mt-10">
          {i.pains.map((p, n) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={n * 70} />
          ))}
        </FeatureGrid>
      </Section>

      <Section>
        <SectionHeading title={`${i.name}で使える機能`} />
        <FeatureGrid className="mt-10">
          {i.features.map((f, n) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} href={f.href} delay={n * 40} />
          ))}
        </FeatureGrid>
      </Section>

      <Section bg="alt">
        <SectionHeading title="よくある質問" />
        <FAQList className="mt-10">
          {i.faqs.map((f) => (
            <FAQItem key={f.question} question={f.question} answer={f.answer} />
          ))}
        </FAQList>
      </Section>

      {terms.length > 0 && (
        <Section>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-sm font-bold text-white">関連する用語</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {terms.map((t) => (
                <Link
                  key={t.slug}
                  href={`/glossary/${t.slug}`}
                  className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/85 transition-colors hover:border-white/[0.2] hover:text-white"
                >
                  {t.term}
                </Link>
              ))}
            </div>
            <div className="mt-8">
              <Link href="/for-shops" className="text-sm font-medium text-blue-400 hover:underline">
                &larr; 施工店の方へ（全体）に戻る
              </Link>
            </div>
          </div>
        </Section>
      )}

      <CTABanner
        title="まずは 1 枚、証明書を発行してみてください。"
        subtitle="無料で始められます。自店のメニューで、実際の画面を確かめてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="料金を見る"
        secondaryHref="/pricing"
        trackLocation={`for-shops-${i.slug}-final`}
      />
    </>
  );
}
