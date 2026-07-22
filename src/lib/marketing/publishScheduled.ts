import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";

/**
 * 公開日時（published_at）を過ぎた予約投稿（status='scheduled'）を 'published' へ自動昇格する。
 * cron (/api/cron/publish-scheduled) から呼ぶ。公開読み取りは status='published' のみを表示するため、
 * 昇格するまで予約投稿は非公開のまま。昇格した種別の公開パスを revalidate する。
 */
export async function publishScheduledPosts(): Promise<{ published: number; slugs: string[] }> {
  const admin = createServiceRoleAdmin("cron:publish-scheduled — promote due scheduled posts to published");

  const { data, error } = await admin
    .from("site_content_posts")
    .update({ status: "published" })
    .eq("status", "scheduled")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .select("slug, type");

  if (error) {
    logger.error("publishScheduledPosts update failed", { error: error.message });
    return { published: 0, slugs: [] };
  }

  const rows = (data ?? []) as { slug: string; type: string }[];
  if (rows.length > 0) {
    const types = new Set(rows.map((r) => r.type));
    if (types.has("news")) {
      revalidatePath("/news");
      revalidatePath("/"); // トップの NewsTeaser
    }
    if (types.has("blog")) revalidatePath("/blog");
    if (types.has("event") || types.has("webinar")) revalidatePath("/events");
    logger.info("publishScheduledPosts promoted scheduled posts", {
      count: rows.length,
      slugs: rows.map((r) => r.slug),
    });
  }

  return { published: rows.length, slugs: rows.map((r) => r.slug) };
}
