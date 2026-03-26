import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import Parser from "rss-parser";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasPermission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { apiUnauthorized, apiInternalError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

const RSS_FEEDS = [
  // ── 塗装・コーティング専門 ──
  { url: "https://tosojiho.jp/?feed=rss2", source: "日本塗装時報", category: "塗装・コーティング" },
  // ── PPF専門 ──
  { url: "https://protection-film.com/feed/", source: "PPF専門店", category: "PPF" },
  // ── 自動車総合（整備・アフターマーケット含む）──
  { url: "https://response.jp/rss/index.rdf", source: "レスポンス", category: "自動車ニュース" },
  { url: "https://car.watch.impress.co.jp/data/rss/1.0/car/feed.rdf", source: "Car Watch", category: "自動車ニュース" },
  { url: "https://www.webcartop.jp/feed/", source: "WEB CARTOP", category: "自動車ニュース" },
  { url: "https://bestcarweb.jp/feed", source: "ベストカー", category: "自動車ニュース" },
  { url: "https://kuruma-news.jp/feed", source: "くるまのニュース", category: "自動車ニュース" },
  { url: "https://clicccar.com/feed/", source: "clicccar", category: "自動車ニュース" },
  // ── 海外 ──
  { url: "https://www.bodyshopbusiness.com/feed/", source: "BodyShop Business", category: "海外・板金塗装" },
  { url: "https://www.fenderender.com/feed/", source: "Fender Bender", category: "海外・板金塗装" },
  { url: "https://feeds.feedburner.com/Autoblog", source: "Autoblog", category: "海外動向" },
];

const parser = new Parser({
  timeout: 8000,
  headers: { "User-Agent": "CARTRUST/1.0 NewsAggregator" },
});

// In-memory cache for live RSS (5 min TTL)
let cachedNews: any[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchLiveFeeds() {
  const now = Date.now();
  if (cachedNews && now - cacheTime < CACHE_TTL) return cachedNews;

  const allItems: any[] = [];
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return (parsed.items ?? []).slice(0, 15).map((item) => ({
          id: item.guid || item.link || `${feed.source}-${item.title}`,
          title: item.title ?? "",
          summary: item.contentSnippet?.slice(0, 200) || item.content?.replace(/<[^>]*>/g, "").slice(0, 200) || "",
          category: feed.category,
          source: feed.source,
          url: item.link ?? null,
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          keywords: [],
          saved: false,
        }));
      } catch {
        return [];
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") allItems.push(...r.value);
  }
  allItems.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  cachedNews = allItems.slice(0, 60);
  cacheTime = now;
  return cachedNews;
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role as Role, "news:view")) return apiForbidden();

    // 1) DBに保存済みの記事を取得（cron で保存されたもの）
    const { data: savedNews } = await supabase
      .from("saved_news")
      .select("*")
      .eq("is_relevant", true)
      .order("published_at", { ascending: false })
      .limit(100);

    // 2) ライブRSSも取得
    const liveNews = await fetchLiveFeeds();

    // 3) マージ（DB記事を優先、URLで重複排除）
    const urlSet = new Set<string>();
    const merged: any[] = [];

    // DB記事を先に追加（saved=trueマーク）
    for (const item of savedNews ?? []) {
      if (item.url) urlSet.add(item.url);
      merged.push({ ...item, saved: true });
    }

    // ライブ記事で重複しないものを追加
    for (const item of liveNews) {
      if (item.url && urlSet.has(item.url)) continue;
      merged.push(item);
    }

    // 日付順ソート
    merged.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

    return NextResponse.json({
      news: merged.slice(0, 80),
      source: "hybrid",
      feedCount: RSS_FEEDS.length + 12, // RSS + スクレイピングサイト
      savedCount: savedNews?.length ?? 0,
    });
  } catch (e) {
    return apiInternalError(e, "news");
  }
}
