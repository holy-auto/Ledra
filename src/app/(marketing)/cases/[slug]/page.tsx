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
  const entries = await listContent("cases");
  return entries.map((e) => ({ slug: e.frontmatter.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getContentBySlug("cases", slug);
  if (!entry) return { title: "Not Found" };
  return {
    title: entry.frontmatter.title,
    description: entry.frontmatter.excerpt,
    alternates: { canonical: `/cases/${entry.frontmatter.slug}` },
  };
}

export default async function CaseDetailPage({ params }: Props) {
  const { slug } = await params;
  const entry = await getContentBySlug("cases", slug);
  if (!entry) notFound();

  return (
    <>
      <Section className="!pt-32 !pb-16">
        <article className="mx-auto max-w-2xl">
          <Link
            href="/cases"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors"
          >
            ← 事例一覧に戻る
          </Link>
          <div className="mt-8">
            <ArticleHero
              seed={entry.frontmatter.slug}
              tag={(entry.frontmatter.industry as string) ?? "CASE"}
              className="aspect-[5/2]"
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-white/80">
            {entry.frontmatter.industry && (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] px-2.5 py-0.5 font-medium">
                {String(entry.frontmatter.industry)}
              </span>
            )}
            {entry.frontmatter.company && <span>{String(entry.frontmatter.company)}</span>}
          </div>
          <h1 className="mt-5 text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight tracking-tight">
            {entry.frontmatter.title}
          </h1>
          {entry.frontmatter.excerpt && (
            <p className="mt-6 text-base leading-relaxed text-white/80">
              {entry.frontmatter.excerpt}
            </p>
          )}
          <div className="mt-10">
            <MarkdownBody content={entry.body} />
          </div>
        </article>
      </Section>

      <CTABanner
        title="貴社の事例も、ぜひお聞かせください"
        subtitle="取材・記事化は Ledra 側で伴走します。掲載企業様には特別ロゴ掲載もご用意。"
        primaryLabel="パイロット参加を申し込む"
        primaryHref="/contact"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
      />
    </>
  );
}
