/**
 * Merge helper for marketing content lists that come from two sources:
 * the DB-backed CMS (`site_content_posts`) and the file-based MDX collection.
 *
 * Used by `/news` (list + teaser) so DB お知らせ posts and MDX news files show
 * together — the same shape `/blog` already assembles inline.
 *
 * Pure and dependency-free so it can be unit-tested without the DB/fs layers.
 */
export type ContentListItem = {
  slug: string;
  title: string;
  excerpt?: string;
  /** ISO date or datetime string. */
  publishedAt?: string;
  tags?: string[];
};

/**
 * De-duplicate by slug (items from `primary` win over `fallback`), then sort by
 * `publishedAt` descending. Items without a date sort last; ties break by slug
 * so ordering is stable/deterministic.
 */
export function mergeContentItems(primary: ContentListItem[], fallback: ContentListItem[]): ContentListItem[] {
  const seen = new Set<string>();
  const items: ContentListItem[] = [];
  for (const it of [...primary, ...fallback]) {
    if (seen.has(it.slug)) continue;
    seen.add(it.slug);
    items.push(it);
  }
  items.sort((a, b) => {
    const da = a.publishedAt ?? "";
    const db = b.publishedAt ?? "";
    if (da === db) return a.slug.localeCompare(b.slug);
    return db.localeCompare(da);
  });
  return items;
}
