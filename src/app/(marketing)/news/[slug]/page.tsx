import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { MarkdownBody } from "@/components/marketing/MarkdownBody";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ArticleJsonLd } from "@/components/marketing/JsonLd";
import { ArticleHero } from "@/components/marketing/ArticleHero";
import { getContentBySlug, listContent } from "@/lib/marketing/content";
import { getPublishedPostBySlug, listPublishedPosts } from "@/lib/marketing/site-content-posts";

type Props = { params: Promise<{ slug: string }> };

type CtaOverrides = {
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  tertiaryLabel?: string;
  tertiaryHref?: string;
};

type ResolvedNews = {
  slug: string;
  title: string;
  excerpt?: string;
  body: string;
  publishedAt?: string;
  tags?: string[];
  heroImageUrl?: string;
  /** CTA overrides only exist for MDX articles (DB posts fall back to defaults). */
  cta?: CtaOverrides;
};

/** DB(お知らせ) を優先し、無ければ MDX にフォールバックする。 */
async function resolveNews(slug: string): Promise<ResolvedNews | null> {
  const dbPost = await getPublishedPostBySlug("news", slug);
  if (dbPost) {
    return {
      slug: dbPost.slug,
      title: dbPost.title,
      excerpt: dbPost.excerpt ?? undefined,
      body: dbPost.body,
      publishedAt: dbPost.published_at ?? undefined,
      tags: dbPost.tags,
      heroImageUrl: dbPost.hero_image_url ?? undefined,
    };
  }

  const entry = await getContentBySlug("news", slug);
  if (!entry) return null;
  const fm = entry.frontmatter;
  return {
    slug: fm.slug,
    title: fm.title,
    excerpt: fm.excerpt,
    body: entry.body,
    publishedAt: fm.publishedAt,
    tags: fm.tags,
    heroImageUrl: typeof fm.hero === "string" ? fm.hero : undefined,
    cta: {
      title: fm.ctaTitle,
      subtitle: fm.ctaSubtitle,
      primaryLabel: fm.ctaPrimaryLabel,
      primaryHref: fm.ctaPrimaryHref,
      secondaryLabel: fm.ctaSecondaryLabel,
      secondaryHref: fm.ctaSecondaryHref,
      tertiaryLabel: fm.ctaTertiaryLabel,
      tertiaryHref: fm.ctaTertiaryHref,
    },
  };
}

export async function generateStaticParams() {
  const [mdx, db] = await Promise.all([listContent("news"), listPublishedPosts(["news"], { limit: 200 })]);
  const slugs = new Set<string>();
  for (const e of mdx) slugs.add(e.frontmatter.slug);
  for (const p of db) slugs.add(p.slug);
  return Array.from(slugs).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await resolveNews(slug);
  if (!article) return { title: "Not Found" };
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/news/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.excerpt,
      url: `/news/${article.slug}`,
      publishedTime: article.publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = await resolveNews(slug);
  if (!article) notFound();

  return (
    <>
      <ArticleJsonLd
        title={article.title}
        description={article.excerpt}
        slug={article.slug}
        publishedAt={article.publishedAt}
      />
      <Section className="!pt-32 !pb-16">
        <article className="mx-auto max-w-2xl">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors"
          >
            ← お知らせ一覧に戻る
          </Link>
          <div className="mt-8">
            {article.heroImageUrl ? (
              // User-supplied external URL; next/image requires remotePatterns config per-host,
              // so fall back to a plain <img>. This is expected for CMS-style content.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.heroImageUrl}
                alt={article.title}
                className="w-full aspect-[5/2] rounded-2xl object-cover border border-white/[0.08]"
              />
            ) : (
              <ArticleHero seed={article.slug} tag={article.tags?.[0] ?? "NEWS"} className="aspect-[5/2]" />
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-white">
            {article.publishedAt && <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>}
            {article.tags?.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[0.688rem] font-medium text-white"
              >
                {t}
              </span>
            ))}
          </div>
          <h1 className="mt-5 text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight tracking-tight">
            {article.title}
          </h1>
          <div className="mt-10">
            <MarkdownBody content={article.body} />
          </div>
        </article>
      </Section>

      <CTABanner
        title={article.cta?.title ?? "Ledra のご紹介資料をお届けします"}
        subtitle={
          article.cta?.subtitle ??
          "機能の全体像、導入事例、セキュリティ仕様をまとめた資料を無料でダウンロードいただけます。"
        }
        primaryLabel={article.cta?.primaryLabel ?? "資料ダウンロード"}
        primaryHref={article.cta?.primaryHref ?? "/resources"}
        secondaryLabel={article.cta?.secondaryLabel ?? "お問い合わせ"}
        secondaryHref={article.cta?.secondaryHref ?? "/contact"}
        tertiaryLabel={article.cta?.tertiaryLabel}
        tertiaryHref={article.cta?.tertiaryHref}
        trackLocation={`news-${article.slug}`}
      />
    </>
  );
}

function formatDate(iso: string): string {
  // MDX は YYYY-MM-DD、DB は ISO datetime。先頭10文字（日付部）で揃える。
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${y}年${Number(m)}月${Number(d)}日`;
}
