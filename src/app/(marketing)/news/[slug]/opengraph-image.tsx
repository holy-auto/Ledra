import { makeOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { getContentBySlug } from "@/lib/marketing/content";
import { getPublishedPostBySlug } from "@/lib/marketing/site-content-posts";

export const alt = "Ledra お知らせ";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // DB(お知らせ)を優先。DB 投稿には ogTitle/ogSubtitle が無いので title/excerpt を使う。
  const dbPost = await getPublishedPostBySlug("news", slug);
  if (dbPost) {
    return makeOgImage({ badge: "NEWS", title: dbPost.title, subtitle: dbPost.excerpt ?? undefined });
  }

  const fm = (await getContentBySlug("news", slug))?.frontmatter;
  return makeOgImage({
    badge: "NEWS",
    // Long article titles overflow the OG canvas — prefer a short ogTitle.
    title: fm?.ogTitle ?? fm?.title ?? "Ledra お知らせ",
    subtitle: fm?.ogSubtitle ?? fm?.excerpt,
  });
}
