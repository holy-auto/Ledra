import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";
import { listContent } from "@/lib/marketing/content";
import { listPublishedPosts } from "@/lib/marketing/site-content-posts";
import { mergeContentItems, type ContentListItem } from "@/lib/marketing/mergeContent";

function formatDate(iso: string): string {
  // MDX は YYYY-MM-DD、DB は ISO datetime。先頭10文字（日付部）で揃える。
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/**
 * Latest-news teaser for the homepage. Hidden when the news collection
 * is empty — we don't want a blank section when there's nothing to say.
 * お知らせは DB(site_content_posts) と MDX の両方から集約する。
 */
export async function NewsTeaser() {
  const [mdxEntries, dbPosts] = await Promise.all([listContent("news"), listPublishedPosts(["news"], { limit: 20 })]);
  const dbItems: ContentListItem[] = dbPosts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? undefined,
    publishedAt: p.published_at ?? undefined,
    tags: p.tags,
  }));
  const mdxItems: ContentListItem[] = mdxEntries.map((e) => ({
    slug: e.frontmatter.slug,
    title: e.frontmatter.title,
    excerpt: e.frontmatter.excerpt,
    publishedAt: e.frontmatter.publishedAt,
    tags: e.frontmatter.tags,
  }));
  const entries = mergeContentItems(dbItems, mdxItems).slice(0, 3);
  if (entries.length === 0) return null;

  return (
    <Section bg="alt" id="news">
      <SectionHeading title="お知らせ" subtitle="Ledra からの最新のリリース情報・プレスリリース。" />
      <div className="mx-auto max-w-3xl divide-y divide-white/[0.06]">
        {entries.map((e, i) => (
          <ScrollReveal key={e.slug} variant="fade-up" delay={i * 60}>
            <Link
              href={`/news/${e.slug}`}
              className="group block py-6 first:pt-0 hover:bg-white/[0.02] rounded-xl -mx-4 px-4 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs text-white">
                {e.publishedAt && <time dateTime={e.publishedAt}>{formatDate(e.publishedAt)}</time>}
                {e.tags?.slice(0, 1).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[0.688rem] font-medium text-white"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <h3 className="mt-3 text-base md:text-lg font-bold text-white group-hover:text-blue-200 transition-colors leading-snug">
                {e.title}
              </h3>
              {e.excerpt && <p className="mt-2 text-sm leading-relaxed text-white line-clamp-2">{e.excerpt}</p>}
            </Link>
          </ScrollReveal>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link
          href="/news"
          data-cta-location="home-news-teaser"
          data-cta-label="view-all-news"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
        >
          すべてのお知らせを見る →
        </Link>
      </div>
    </Section>
  );
}
