import { createPublicClient } from "@/lib/supabase/public";
import type { SiteContentType } from "@/lib/validations/site-content-post";

export type PublicContentPost = {
  id: string;
  type: SiteContentType;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  hero_image_url: string | null;
  tags: string[];
  author: string | null;
  published_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location: string | null;
  online_url: string | null;
  capacity: number | null;
  registration_url: string | null;
  cta_title: string | null;
  cta_subtitle: string | null;
  cta_primary_label: string | null;
  cta_primary_href: string | null;
  cta_secondary_label: string | null;
  cta_secondary_href: string | null;
  og_title: string | null;
  og_subtitle: string | null;
};

// 公開読み取りの select 列（type/一覧/詳細で共通）
const PUBLIC_POST_COLUMNS =
  "id, type, slug, title, excerpt, body, hero_image_url, tags, author, published_at, event_start_at, event_end_at, location, online_url, capacity, registration_url, cta_title, cta_subtitle, cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href, og_title, og_subtitle";

/** HP向け: 公開済みの投稿だけを取得する（RLSでもフィルタされるが明示的に） */
export async function listPublishedPosts(
  types: SiteContentType[],
  opts: { limit?: number } = {},
): Promise<PublicContentPost[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_content_posts")
    .select(PUBLIC_POST_COLUMNS)
    .eq("status", "published")
    .in("type", types)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 100);

  if (error) {
    console.warn("[site-content] listPublishedPosts failed:", error.message);
    return [];
  }
  return (data ?? []) as PublicContentPost[];
}

export async function getPublishedPostBySlug(type: SiteContentType, slug: string): Promise<PublicContentPost | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_content_posts")
    .select(PUBLIC_POST_COLUMNS)
    .eq("status", "published")
    .eq("type", type)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.warn("[site-content] getPublishedPostBySlug failed:", error.message);
    return null;
  }
  return (data as PublicContentPost | null) ?? null;
}
