import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { syncExternalPost } from "./externalPublish";
import { isExternalSite } from "./externalSites";
import type { SiteContentType } from "@/lib/validations/site-content-post";

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
    .select("id, slug, type, site, title, title_en, category, excerpt, body, published_at");

  if (error) {
    logger.error("publishScheduledPosts update failed", { error: error.message });
    return { published: 0, slugs: [] };
  }

  const rows = (data ?? []) as {
    id: string;
    slug: string;
    type: SiteContentType;
    site: string;
    title: string;
    title_en: string | null;
    category: string | null;
    excerpt: string | null;
    body: string | null;
    published_at: string | null;
  }[];

  // 外部サイト（holy-inc / MobileWash）向けの予約投稿は、md を相手リポジトリへ
  // コミットしないと公開されない。失敗したら下書きへ戻す（DB だけ公開済みで
  // サイトに出ていない状態を残さない）。
  for (const row of rows.filter((r) => isExternalSite(r.site))) {
    const synced = await syncExternalPost({
      site: row.site,
      type: row.type,
      status: "published",
      slug: row.slug,
      title: row.title,
      title_en: row.title_en,
      category: row.category,
      excerpt: row.excerpt,
      body: row.body ?? "",
      published_at: row.published_at,
    });
    if (!synced.ok) {
      await admin.from("site_content_posts").update({ status: "draft" }).eq("id", row.id);
      logger.error("scheduled external post failed; reverted to draft", {
        slug: row.slug,
        site: row.site,
        reason: synced.message,
      });
    }
  }

  if (rows.length > 0) {
    const types = new Set(rows.filter((r) => !isExternalSite(r.site)).map((r) => r.type));
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
