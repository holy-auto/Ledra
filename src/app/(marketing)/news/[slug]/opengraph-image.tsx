import { makeOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { getContentBySlug } from "@/lib/marketing/content";

export const alt = "Ledra お知らせ";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = await getContentBySlug("news", slug);
  const fm = entry?.frontmatter;

  return makeOgImage({
    badge: "NEWS",
    // Long article titles overflow the OG canvas — prefer a short ogTitle.
    title: fm?.ogTitle ?? fm?.title ?? "Ledra お知らせ",
    subtitle: fm?.ogSubtitle ?? fm?.excerpt,
  });
}
