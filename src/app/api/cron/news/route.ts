import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ── 業界キーワード（これにマッチする記事だけ保存）──
const RELEVANT_KEYWORDS = [
  // コーティング
  "コーティング",
  "coating",
  "ガラスコーティング",
  "セラミックコーティング",
  "KeePer",
  "キーパー",
  "撥水",
  "親水",
  "疎水",
  // PPF
  "PPF",
  "プロテクションフィルム",
  "ペイントプロテクション",
  "XPEL",
  "サンテック",
  "STEK",
  "3M",
  "保護フィルム",
  "ラッピング",
  // 塗装
  "塗装",
  "板金",
  "鈑金",
  "ボデー",
  "ボディ",
  "ペイント",
  "補修",
  "調色",
  "カラー",
  // 整備
  "整備",
  "車検",
  "点検",
  "メンテナンス",
  "修理",
  "整備士",
  "認証工場",
  "指定工場",
  // カーディテイリング
  "ディテイリング",
  "detailing",
  "磨き",
  "研磨",
  "ポリッシュ",
  "洗車",
  "カーケア",
  // 業界・市場
  "アフターマーケット",
  "施工店",
  "施工",
  "認定",
  "資格",
  "損害保険",
  "保険",
  "査定",
  "事故車",
  // EV関連
  "EV",
  "電気自動車",
  "テスラ",
  "BYD",
  // 法改正・規制
  "法改正",
  "改正",
  "省令",
  "告示",
  "通達",
  "パブリックコメント",
  "道路運送車両法",
  "保安基準",
  "車両法",
  "型式指定",
  "OBD検査",
  "特定整備",
  "電子制御",
  "排ガス規制",
  "騒音規制",
  "燃費基準",
  "CAFE",
  "自賠責",
  "リコール",
  "届出",
  // 海外動向
  "EU規制",
  "欧州",
  "米国",
  "北米",
  "NHTSA",
  "EPA",
  "中国",
  "IATF",
  "ISO",
  "グローバル",
  "SEMA",
  "Automechanika",
  "IDA",
  "paint protection",
  "ceramic coating",
  "detailing industry",
  "aftermarket",
  "auto body",
  "collision repair",
];

// ── RSS フィード ──
const RSS_FEEDS = [
  {
    url: "https://tosojiho.jp/?feed=rss2",
    source: "日本塗装時報",
    category: "塗装・コーティング",
    alwaysRelevant: true,
  },
  { url: "https://protection-film.com/feed/", source: "PPF専門店", category: "PPF", alwaysRelevant: true },
  { url: "https://response.jp/rss/index.rdf", source: "レスポンス", category: "自動車ニュース", alwaysRelevant: false },
  {
    url: "https://car.watch.impress.co.jp/data/rss/1.0/car/feed.rdf",
    source: "Car Watch",
    category: "自動車ニュース",
    alwaysRelevant: false,
  },
  { url: "https://www.webcartop.jp/feed/", source: "WEB CARTOP", category: "自動車ニュース", alwaysRelevant: false },
  { url: "https://bestcarweb.jp/feed", source: "ベストカー", category: "自動車ニュース", alwaysRelevant: false },
  { url: "https://kuruma-news.jp/feed", source: "くるまのニュース", category: "自動車ニュース", alwaysRelevant: false },
  { url: "https://clicccar.com/feed/", source: "clicccar", category: "自動車ニュース", alwaysRelevant: false },
  // ── 法改正・行政 ──
  {
    url: "https://www.mlit.go.jp/rss/road_bureau.xml",
    source: "国交省（道路局）",
    category: "法改正・規制",
    alwaysRelevant: false,
  },
  // ── 海外ニュース ──
  { url: "https://www.autonews.com/rss.xml", source: "Automotive News", category: "海外動向", alwaysRelevant: false },
  { url: "https://www.just-auto.com/feed/", source: "Just Auto", category: "海外動向", alwaysRelevant: false },
  {
    url: "https://www.greencarreports.com/rss",
    source: "Green Car Reports",
    category: "海外EV動向",
    alwaysRelevant: false,
  },
  { url: "https://feeds.feedburner.com/Autoblog", source: "Autoblog", category: "海外動向", alwaysRelevant: false },
  {
    url: "https://www.bodyshopbusiness.com/feed/",
    source: "BodyShop Business",
    category: "海外・板金塗装",
    alwaysRelevant: true,
  },
  {
    url: "https://www.fenderender.com/feed/",
    source: "Fender Bender",
    category: "海外・板金塗装",
    alwaysRelevant: true,
  },
];

// ── スクレイピング対象サイト（RSS無し）──
interface ScrapeTarget {
  url: string;
  source: string;
  category: string;
  alwaysRelevant: boolean;
  // CSSセレクタでページから記事を抽出
  selectors: {
    articleList: string; // 記事リストのコンテナ
    title: string; // タイトル要素
    link: string; // リンク要素（a tag）
    summary?: string; // 要約・説明
    date?: string; // 日付
  };
  baseUrl: string; // 相対URL補完用
}

const SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    url: "https://www.keeper-coating.com/news/",
    source: "KeePer技研",
    category: "コーティング",
    alwaysRelevant: true,
    selectors: {
      articleList: ".news-list li, .post-list li, article, .entry",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .excerpt, .summary, .description",
      date: "time, .date, .post-date, span",
    },
    baseUrl: "https://www.keeper-coating.com",
  },
  {
    url: "https://www.jaspa.or.jp/news/",
    source: "日整連（JASPA）",
    category: "整備業界",
    alwaysRelevant: true,
    selectors: {
      articleList: ".news-list li, .post-list li, article, .entry, tr, .news_item",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .excerpt, .summary",
      date: "time, .date, td, span",
    },
    baseUrl: "https://www.jaspa.or.jp",
  },
  {
    url: "https://www.mlit.go.jp/jidosha/jidosha_fr1_000083.html",
    source: "国土交通省（自動車）",
    category: "行政・規制",
    alwaysRelevant: false,
    selectors: {
      articleList: "ul li, .contentsBody li, .list li",
      title: "a",
      link: "a",
      date: "span, .date",
    },
    baseUrl: "https://www.mlit.go.jp",
  },
  {
    url: "https://jaf.or.jp/common/news",
    source: "JAF",
    category: "自動車団体",
    alwaysRelevant: false,
    selectors: {
      articleList: ".news-list li, article, .card, .list-item",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .text, .description",
      date: "time, .date, span",
    },
    baseUrl: "https://jaf.or.jp",
  },
  {
    url: "https://www.stek-japan.com/news",
    source: "STEK Japan",
    category: "PPF",
    alwaysRelevant: true,
    selectors: {
      articleList: "article, .post, .news-item, .card, .blog-item",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .excerpt, .summary",
      date: "time, .date, span",
    },
    baseUrl: "https://www.stek-japan.com",
  },
  {
    url: "https://www.xpel.co.jp/blog",
    source: "XPEL Japan",
    category: "PPF",
    alwaysRelevant: true,
    selectors: {
      articleList: "article, .post, .blog-post, .card, .entry",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .excerpt, .summary",
      date: "time, .date, span",
    },
    baseUrl: "https://www.xpel.co.jp",
  },
  {
    url: "https://gazoo.com/news/",
    source: "GAZOO",
    category: "自動車ニュース",
    alwaysRelevant: false,
    selectors: {
      articleList: "article, .news-item, .card, .list-item, li",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .text, .description",
      date: "time, .date, span",
    },
    baseUrl: "https://gazoo.com",
  },
  // ── 法改正・行政（スクレイピング）──
  {
    url: "https://www.mlit.go.jp/jidosha/jidosha_fr10_000044.html",
    source: "国交省（リコール）",
    category: "法改正・規制",
    alwaysRelevant: false,
    selectors: {
      articleList: "ul li, .contentsBody li, .list li, tr",
      title: "a",
      link: "a",
      date: "span, .date, td",
    },
    baseUrl: "https://www.mlit.go.jp",
  },
  {
    url: "https://www.env.go.jp/air/car/index.html",
    source: "環境省（自動車排出ガス）",
    category: "法改正・規制",
    alwaysRelevant: false,
    selectors: {
      articleList: "ul li, .contentsBody li, article",
      title: "a",
      link: "a",
      date: "span, .date",
    },
    baseUrl: "https://www.env.go.jp",
  },
  // ── 海外（スクレイピング）──
  {
    url: "https://www.semashow.com/news",
    source: "SEMA Show",
    category: "海外・展示会",
    alwaysRelevant: true,
    selectors: {
      articleList: "article, .card, .news-item, .post, .list-item",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .excerpt, .summary, .description",
      date: "time, .date, span",
    },
    baseUrl: "https://www.semashow.com",
  },
  {
    url: "https://www.ida-online.org/news",
    source: "IDA（国際ディテイリング協会）",
    category: "海外・ディテイリング",
    alwaysRelevant: true,
    selectors: {
      articleList: "article, .card, .news-item, .post, .blog-item",
      title: "a, h2, h3, .title",
      link: "a",
      summary: "p, .excerpt, .summary",
      date: "time, .date, span",
    },
    baseUrl: "https://www.ida-online.org",
  },
  {
    url: "https://www.automechanika.messefrankfurt.com/frankfurt/en/press.html",
    source: "Automechanika",
    category: "海外・展示会",
    alwaysRelevant: true,
    selectors: {
      articleList: "article, .card, .news-item, .teaser, .press-item",
      title: "a, h2, h3, .title, .headline",
      link: "a",
      summary: "p, .excerpt, .text, .description",
      date: "time, .date, span",
    },
    baseUrl: "https://www.automechanika.messefrankfurt.com",
  },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Ledra/1.0";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": UA },
});

function isRelevant(title: string, content: string): string[] {
  const text = `${title} ${content}`;
  return RELEVANT_KEYWORDS.filter((kw) => text.toLowerCase().includes(kw.toLowerCase()));
}

// ── スクレイピング処理 ──
interface ScrapedArticle {
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string | null;
  published_at: string;
  keywords: string[];
  is_relevant: boolean;
}

async function scrapesite(target: ScrapeTarget): Promise<ScrapedArticle[]> {
  const res = await fetch(target.url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const articles: ScrapedArticle[] = [];
  const seenUrls = new Set<string>();

  $(target.selectors.articleList).each((_, el) => {
    const $el = $(el);

    // タイトル取得
    const $titleEl = $el.find(target.selectors.title).first();
    const title = $titleEl.text().trim();
    if (!title || title.length < 5 || title.length > 200) return;

    // リンク取得
    const $linkEl = $el.find(target.selectors.link).first();
    let href = $linkEl.attr("href") ?? "";
    if (href && !href.startsWith("http")) {
      href = href.startsWith("/") ? `${target.baseUrl}${href}` : `${target.baseUrl}/${href}`;
    }
    if (!href || seenUrls.has(href)) return;
    // ハッシュリンクやJSリンクは除外
    if (href.startsWith("#") || href.startsWith("javascript:")) return;
    seenUrls.add(href);

    // 要約取得
    let summary = "";
    if (target.selectors.summary) {
      summary = $el.find(target.selectors.summary).first().text().trim().slice(0, 300);
    }

    // 日付取得
    let dateStr = new Date().toISOString();
    if (target.selectors.date) {
      const dateText = $el.find(target.selectors.date).first().text().trim();
      // 日本語の日付パターンをパース（2026年3月14日、2026/03/14、2026.03.14）
      const dateMatch = dateText.match(/(\d{4})[年/./-](\d{1,2})[月/./-](\d{1,2})/);
      if (dateMatch) {
        dateStr = new Date(
          `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`,
        ).toISOString();
      }
    }

    const matchedKeywords = isRelevant(title, summary);

    if (!target.alwaysRelevant && matchedKeywords.length === 0) return;

    articles.push({
      title,
      summary,
      category: target.category,
      source: target.source,
      url: href,
      published_at: dateStr,
      keywords: target.alwaysRelevant ? [target.category] : matchedKeywords.slice(0, 10),
      is_relevant: true,
    });
  });

  return articles.slice(0, 20);
}

export async function GET(req: NextRequest) {
  // cron秘密キーで認証
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: authError ?? "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();

    let totalFetched = 0;
    let totalSaved = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // ── 1) RSSフィード収集 ──
    await Promise.allSettled(
      RSS_FEEDS.map(async (feed) => {
        try {
          const parsed = await parser.parseURL(feed.url);
          const items = parsed.items ?? [];
          totalFetched += items.length;

          const toInsert = [];

          for (const item of items.slice(0, 20)) {
            const title = item.title ?? "";
            const content = item.contentSnippet || item.content?.replace(/<[^>]*>/g, "") || "";
            const matchedKeywords = isRelevant(title, content);

            if (!feed.alwaysRelevant && matchedKeywords.length === 0) {
              totalSkipped++;
              continue;
            }

            toInsert.push({
              title,
              summary: content.slice(0, 300),
              category: feed.category,
              source: feed.source,
              url: item.link ?? null,
              published_at: item.isoDate || item.pubDate || new Date().toISOString(),
              keywords: feed.alwaysRelevant ? [feed.category] : matchedKeywords.slice(0, 10),
              is_relevant: true,
            });
          }

          if (toInsert.length > 0) {
            const { data, error } = await supabase
              .from("saved_news")
              .upsert(toInsert, { onConflict: "url", ignoreDuplicates: true })
              .select("id");

            if (error) {
              errors.push(`[RSS] ${feed.source}: ${error.message}`);
            } else {
              totalSaved += data?.length ?? 0;
            }
          }
        } catch (e: unknown) {
          errors.push(`[RSS] ${feed.source}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    );

    // ── 2) スクレイピング収集 ──
    await Promise.allSettled(
      SCRAPE_TARGETS.map(async (target) => {
        try {
          const articles = await scrapesite(target);
          totalFetched += articles.length;

          if (articles.length === 0) return;

          const { data, error } = await supabase
            .from("saved_news")
            .upsert(articles, { onConflict: "url", ignoreDuplicates: true })
            .select("id");

          if (error) {
            errors.push(`[SCRAPE] ${target.source}: ${error.message}`);
          } else {
            totalSaved += data?.length ?? 0;
          }
        } catch (e: unknown) {
          errors.push(`[SCRAPE] ${target.source}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        rssFeeds: RSS_FEEDS.length,
        scrapeSites: SCRAPE_TARGETS.length,
        totalSources: RSS_FEEDS.length + SCRAPE_TARGETS.length,
        totalFetched,
        totalSaved,
        totalSkipped,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    await sendCronFailureAlert("news", e);
    return NextResponse.json({ error: "News cron failed" }, { status: 500 });
  }
}
