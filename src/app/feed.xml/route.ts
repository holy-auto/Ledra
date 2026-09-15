/**
 * GET /feed.xml — お知らせ（/news）とブログ（/blog）の RSS。
 *
 * 記事は DB(`site_content_posts`) と MDX(`src/content/`) の両方にある。
 * 一覧ページと同じ方針で DB を優先して slug で重複排除する
 * （`mergeContentItems` の primary が DB）。
 *
 * どちらの取得も個別に握りつぶす。片方が落ちてもフィードは出す。
 */
import { listContent, type ContentCollection } from "@/lib/marketing/content";
import { listPublishedPosts } from "@/lib/marketing/site-content-posts";
import { mergeContentItems, type ContentListItem } from "@/lib/marketing/mergeContent";
import { buildRssFeed, feedSortKey, type FeedItem } from "@/lib/marketing/rss";
import type { SiteContentType } from "@/lib/validations/site-content-post";

/** 5分。予約投稿の cron と同じ間隔（それより短くしても公開は早まらない）。 */
export const revalidate = 300;

async function collect(collection: ContentCollection & SiteContentType, category: string): Promise<FeedItem[]> {
  const [dbPosts, mdxEntries] = await Promise.all([
    listPublishedPosts([collection], { limit: 50 }).catch(() => []),
    listContent(collection).catch(() => []),
  ]);

  const dbItems: ContentListItem[] = dbPosts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? undefined,
    publishedAt: p.published_at ?? undefined,
  }));
  const mdxItems: ContentListItem[] = mdxEntries.map((e) => ({
    slug: e.frontmatter.slug,
    title: e.frontmatter.title,
    excerpt: e.frontmatter.excerpt,
    publishedAt: e.frontmatter.publishedAt,
  }));

  return mergeContentItems(dbItems, mdxItems).map((it) => ({
    path: `/${collection}/${it.slug}`,
    title: it.title,
    description: it.excerpt,
    publishedAt: it.publishedAt,
    category,
  }));
}

export async function GET() {
  const [news, blog] = await Promise.all([collect("news", "お知らせ"), collect("blog", "ブログ")]);
  // 新しい順にまとめる。MDX は日付だけ・DB は UTC の日時なので、
  // 文字列比較ではなく同じ尺度（実際の時刻）に直して比べる。日付の無い記事は末尾。
  const items = [...news, ...blog].sort((a, b) => feedSortKey(b.publishedAt) - feedSortKey(a.publishedAt));

  return new Response(buildRssFeed(items), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
