import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { CTABanner } from "@/components/marketing/CTABanner";
import { DefinedTermJsonLd } from "@/components/marketing/JsonLd";
import { GLOSSARY, GLOSSARY_CATEGORIES, getGlossaryTerm } from "@/lib/marketing/glossary";

type Props = { params: Promise<{ slug: string }> };

// 用語は静的なので不明な slug は 404（プログラマティックだが有限集合）。
export const dynamicParams = false;

export function generateStaticParams() {
  return GLOSSARY.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = getGlossaryTerm(slug);
  if (!t) return { title: "Not Found" };
  return {
    title: `${t.term}とは ── 用語集`,
    description: t.short,
    alternates: { canonical: `/glossary/${t.slug}` },
    openGraph: {
      title: `${t.term}とは | Ledra 用語集`,
      description: t.short,
      url: `/glossary/${t.slug}`,
      siteName: "Ledra",
      locale: "ja_JP",
      type: "article",
    },
  };
}

export default async function GlossaryTermPage({ params }: Props) {
  const { slug } = await params;
  const t = getGlossaryTerm(slug);
  if (!t) notFound();

  const related = t.related.map(getGlossaryTerm).filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <>
      <DefinedTermJsonLd term={t.term} definition={t.definition} slug={t.slug} />
      <Breadcrumbs
        items={[
          { name: "用語集", url: "/glossary" },
          { name: t.term, url: `/glossary/${t.slug}` },
        ]}
      />
      <PageHero
        badge={`用語集 › ${GLOSSARY_CATEGORIES[t.category].label}`}
        title={`${t.term}とは`}
        subtitle={t.short}
      />

      <Section>
        <article className="mx-auto max-w-2xl">
          <p className="text-xs font-medium text-white/50">{t.reading}</p>
          <p className="mt-5 text-base leading-relaxed text-white/90 md:text-lg">{t.definition}</p>

          {t.seeAlso && (
            <div className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
              <span className="text-xs font-medium uppercase tracking-widest text-blue-300">関連機能</span>
              <div className="mt-2">
                <Link href={t.seeAlso.href} className="text-sm font-medium text-blue-400 hover:underline">
                  {t.seeAlso.label} &rarr;
                </Link>
              </div>
            </div>
          )}

          {related.length > 0 && (
            <div className="mt-10">
              <h2 className="text-sm font-bold text-white">関連する用語</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/glossary/${r.slug}`}
                    className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/85 transition-colors hover:border-white/[0.2] hover:text-white"
                  >
                    {r.term}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 border-t border-white/[0.08] pt-6">
            <Link href="/glossary" className="text-sm font-medium text-blue-400 hover:underline">
              &larr; 用語集の一覧に戻る
            </Link>
          </div>
        </article>
      </Section>

      <CTABanner
        title="ことばの先の、実物を。"
        subtitle="無料で実際の証明書を発行して、手ざわりを確かめてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧を見る"
        secondaryHref="/features"
        trackLocation="glossary-term-final"
      />
    </>
  );
}
