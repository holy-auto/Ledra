/**
 * RSS 2.0 フィードの組み立て。
 *
 * `/feed.xml`（`src/app/feed.xml/route.ts`）から使う。記事の取得元は
 * DB(`site_content_posts`) と MDX(`src/content/`) の2つあるが、ここは
 * 取得済みの配列を XML にするだけの純関数にしてある（テストのため）。
 */
import { siteConfig } from "./config";

export type FeedItem = {
  /** 記事URL（サイト内の絶対パス。例: /news/2026-04-22-service-launch） */
  path: string;
  title: string;
  description?: string;
  /** ISO の日付か日時。無ければ pubDate を出さない。 */
  publishedAt?: string;
  category?: string;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 日付だけ（YYYY-MM-DD）の場合は JST の 0 時として扱う。
 * 不正な値は pubDate を出さない（壊れた日付でフィードごと落とさない）。
 */
function toPubDate(value: string | undefined): string | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toUTCString();
}

export function buildRssFeed(items: FeedItem[]): string {
  const origin = siteConfig.siteUrl;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc(siteConfig.siteName)} のお知らせ・ブログ</title>`,
    `    <link>${origin}/news</link>`,
    `    <description>${esc(siteConfig.siteTagline)}</description>`,
    "    <language>ja</language>",
    `    <atom:link href="${origin}/feed.xml" rel="self" type="application/rss+xml" />`,
  ];

  for (const item of items) {
    const url = `${origin}${item.path}`;
    const pubDate = toPubDate(item.publishedAt);
    lines.push("    <item>");
    lines.push(`      <title>${esc(item.title)}</title>`);
    lines.push(`      <link>${url}</link>`);
    lines.push(`      <guid isPermaLink="true">${url}</guid>`);
    if (pubDate) lines.push(`      <pubDate>${pubDate}</pubDate>`);
    if (item.category) lines.push(`      <category>${esc(item.category)}</category>`);
    if (item.description) lines.push(`      <description>${esc(item.description)}</description>`);
    lines.push("    </item>");
  }

  lines.push("  </channel>", "</rss>", "");
  return lines.join("\n");
}
