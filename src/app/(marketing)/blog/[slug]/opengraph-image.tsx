import { makeOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { getContentBySlug } from "@/lib/marketing/content";
import { getPublishedPostBySlug } from "@/lib/marketing/site-content-posts";

export const alt = "Ledra ブログ";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [dbPost, mdxEntry] = await Promise.all([getPublishedPostBySlug("blog", slug), getContentBySlug("blog", slug)]);

  const title = dbPost?.title ?? mdxEntry?.frontmatter.title ?? "Ledra ブログ";
  const subtitle = dbPost?.excerpt ?? mdxEntry?.frontmatter.excerpt ?? undefined;
  const imageUrl = dbPost?.hero_image_url ?? undefined;

  return makeOgImage({ badge: "BLOG", title, subtitle, imageUrl });
}
