import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/marketing/config";
import { listContent, type ContentCollection } from "@/lib/marketing/content";
import { listPublishedPosts } from "@/lib/marketing/site-content-posts";

const base = siteConfig.siteUrl;

type Freq = MetadataRoute.Sitemap[number]["changeFrequency"];

/**
 * Static marketing routes. Keep in sync with `src/app/(marketing)/**`.
 * Redirect-only stubs (`/contact/{shops,insurers,agents}`) and gated app
 * areas (disallowed in robots.ts) are intentionally excluded.
 */
const staticPages: Array<{ path: string; changeFrequency: Freq; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },

  // Audience landing pages (primary conversion)
  { path: "/for-shops", changeFrequency: "monthly", priority: 0.9 },
  { path: "/for-insurers", changeFrequency: "monthly", priority: 0.9 },
  { path: "/for-agents", changeFrequency: "monthly", priority: 0.9 },
  { path: "/for-btob", changeFrequency: "monthly", priority: 0.9 },

  // Product
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/features", changeFrequency: "monthly", priority: 0.8 },
  { path: "/features/digital-certificate", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/digital-signature", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/blockchain-anchoring", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/customer-portal", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/customer-360", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/insurer-portal", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/timeline", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/vehicle-ocr", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/nfc", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/job-workflow", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/accounting", changeFrequency: "monthly", priority: 0.7 },
  { path: "/features/academy", changeFrequency: "monthly", priority: 0.7 },

  // Decision support
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/roi", changeFrequency: "monthly", priority: 0.7 },
  { path: "/demo", changeFrequency: "monthly", priority: 0.7 },
  { path: "/guide", changeFrequency: "monthly", priority: 0.6 },

  // Content hubs (individual article URLs are appended dynamically below)
  { path: "/news", changeFrequency: "weekly", priority: 0.7 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/cases", changeFrequency: "weekly", priority: 0.7 },
  { path: "/events", changeFrequency: "weekly", priority: 0.6 },

  // Trust & resources
  { path: "/security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/resources", changeFrequency: "monthly", priority: 0.6 },
  { path: "/poc", changeFrequency: "monthly", priority: 0.6 },
  { path: "/verify", changeFrequency: "monthly", priority: 0.6 },
  { path: "/support", changeFrequency: "monthly", priority: 0.5 },
  { path: "/financial-transparency", changeFrequency: "monthly", priority: 0.5 },
  { path: "/data-disclosure", changeFrequency: "monthly", priority: 0.5 },
  { path: "/law", changeFrequency: "yearly", priority: 0.5 },

  // Contact & legal
  { path: "/contact", changeFrequency: "yearly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
  { path: "/security-policy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/tokusho", changeFrequency: "yearly", priority: 0.4 },
];

type Article = { slug: string; lastModified?: string };

/** MDX-backed slugs for a collection. File-based, build-safe, never throws. */
async function mdxEntries(collection: ContentCollection): Promise<Article[]> {
  try {
    const entries = await listContent(collection);
    return entries.map((e) => ({ slug: e.frontmatter.slug, lastModified: e.frontmatter.publishedAt }));
  } catch {
    return [];
  }
}

/** DB-backed published blog slugs. Guarded so a DB hiccup can't break the sitemap. */
async function blogDbEntries(): Promise<Article[]> {
  try {
    const posts = await listPublishedPosts(["blog"]);
    return posts.map((p) => ({ slug: p.slug, lastModified: p.published_at ?? undefined }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticPages.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Article URLs from every content source. Each loader is independently
  // guarded — worst case we still emit the full static route set.
  const [news, cases, blogMdx, blogDb] = await Promise.all([
    mdxEntries("news"),
    mdxEntries("cases"),
    mdxEntries("blog"),
    blogDbEntries(),
  ]);

  // Blog slugs can come from MDX or the DB; de-duplicate (MDX wins).
  const blog = new Map<string, Article>();
  for (const e of [...blogMdx, ...blogDb]) {
    if (!blog.has(e.slug)) blog.set(e.slug, e);
  }

  const toEntry = (prefix: string, { slug, lastModified }: Article): MetadataRoute.Sitemap[number] => {
    const parsed = lastModified ? new Date(lastModified) : now;
    return {
      url: `${base}${prefix}/${slug}`,
      lastModified: Number.isNaN(parsed.getTime()) ? now : parsed,
      changeFrequency: "monthly",
      priority: 0.6,
    };
  };

  const dynamicEntries: MetadataRoute.Sitemap = [
    ...news.map((e) => toEntry("/news", e)),
    ...cases.map((e) => toEntry("/cases", e)),
    ...[...blog.values()].map((e) => toEntry("/blog", e)),
  ];

  return [...staticEntries, ...dynamicEntries];
}
