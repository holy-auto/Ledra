import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { MarkdownBody } from "@/components/marketing/MarkdownBody";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ArticleHero } from "@/components/marketing/ArticleHero";
import { getContentBySlug, listContent } from "@/lib/marketing/content";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const entries = await listContent("news");
  return entries.map((e) => ({ slug: e.frontmatter.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getContentBySlug("news", slug);
  if (!entry) return { title: "Not Found" };
  return {
    title: entry.frontmatter.title,
    description: entry.frontmatter.excerpt,
    alternates: { canonical: `/news/${entry.frontmatter.slug}` },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const entry = await getContentBySlug("news", slug);
  if (!entry) notFound();

  return (
    <>
      <Section className="!pt-32 !pb-16">
        <article className="mx-auto max-w-2xl">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors"
          >
            ← お知らせ一覧に戻る
          </Link>
          <div className="mt-8">
            <ArticleHero
              seed={entry.frontmatter.slug}
              tag={entry.frontmatter.tags?.[0] ?? "NEWS"}
              className="aspect-[5/2]"
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-white/75">
            {entry.frontmatter.publishedAt && (
              <time dateTime={entry.frontmatter.publishedAt}>
                {formatDate(entry.frontmatter.publishedAt)}
              </time>
            )}
            {entry.frontmatter.tags?.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[0.688rem] font-medium text-white/80"
              >
                {t}
              </span>
            ))}
          </div>
          <h1 className="mt-5 text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight tracking-tight">
            {entry.frontmatter.title}
          </h1>
          <div className="mt-10">
            <MarkdownBody content={entry.body} />
          </div>
        </article>
      </Section>

      <CTABanner
        title="Ledra のご紹介資料をお届けします"
        subtitle="機能の全体像、導入事例、セキュリティ仕様をまとめた資料を無料でダウンロードいただけます。"
        primaryLabel="資料ダウンロード"
        primaryHref="/resources"
        secondaryLabel="お問い合わせ"
        secondaryHref="/contact"
      />
    </>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}年${Number(m)}月${Number(d)}日`;
}
