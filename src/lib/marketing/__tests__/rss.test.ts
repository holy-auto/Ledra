import { describe, expect, it } from "vitest";
import { buildRssFeed, feedSortKey } from "../rss";
import { siteConfig } from "../config";

describe("buildRssFeed", () => {
  it("チャンネルの自己参照リンクと記事リンクを絶対URLで出す", () => {
    const xml = buildRssFeed([{ path: "/news/hello", title: "こんにちは" }]);
    expect(xml).toContain(`<atom:link href="${siteConfig.siteUrl}/feed.xml" rel="self"`);
    expect(xml).toContain(`<link>${siteConfig.siteUrl}/news/hello</link>`);
    expect(xml).toContain(`<guid isPermaLink="true">${siteConfig.siteUrl}/news/hello</guid>`);
  });

  it("日付だけの publishedAt を JST 0時として RFC822 に変換する", () => {
    const xml = buildRssFeed([{ path: "/news/a", title: "a", publishedAt: "2026-04-22" }]);
    // 2026-04-22T00:00+09:00 = 2026-04-21T15:00Z
    expect(xml).toContain("<pubDate>Tue, 21 Apr 2026 15:00:00 GMT</pubDate>");
  });

  it("publishedAt が無い／壊れているときは pubDate を出さない（フィードごと落とさない）", () => {
    expect(buildRssFeed([{ path: "/news/a", title: "a" }])).not.toContain("<pubDate>");
    expect(buildRssFeed([{ path: "/news/a", title: "a", publishedAt: "きのう" }])).not.toContain("<pubDate>");
  });

  it('タイトル・本文の & < > " をエスケープする', () => {
    const xml = buildRssFeed([{ path: "/blog/x", title: "A & B <tag>", description: '"引用"' }]);
    expect(xml).toContain("<title>A &amp; B &lt;tag&gt;</title>");
    expect(xml).toContain("<description>&quot;引用&quot;</description>");
    expect(xml).not.toContain("<tag>");
  });

  it("記事が0件でも RSS として成立する", () => {
    const xml = buildRssFeed([]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });
});

describe("feedSortKey", () => {
  it("日付だけの MDX と UTC 日時の DB を同じ尺度で比べる", () => {
    // 2026-04-21T20:00Z は 2026-04-22T05:00+09:00 なので、MDX の 2026-04-22（JST 0時）より新しい
    expect(feedSortKey("2026-04-21T20:00:00+00:00")).toBeGreaterThan(feedSortKey("2026-04-22"));
  });

  it("日付が無い／壊れている記事は末尾に落ちる", () => {
    expect(feedSortKey(undefined)).toBe(Number.NEGATIVE_INFINITY);
    expect(feedSortKey("きのう")).toBe(Number.NEGATIVE_INFINITY);
  });
});
