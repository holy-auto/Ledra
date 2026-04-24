import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
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
};

/** HP向け: 公開済みの投稿だけを取得する（RLSでもフィルタされるが明示的に） */
export async function listPublishedPosts(
  types: SiteContentType[],
  opts: { limit?: number } = {},
): Promise<PublicContentPost[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_content_posts")
    .select(
      "id, type, slug, title, excerpt, body, hero_image_url, tags, author, published_at, event_start_at, event_end_at, location, online_url, capacity, registration_url",
    )
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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_content_posts")
    .select(
      "id, type, slug, title, excerpt, body, hero_image_url, tags, author, published_at, event_start_at, event_end_at, location, online_url, capacity, registration_url",
    )
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
