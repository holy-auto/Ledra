import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/marketing/config";

// NOTE: robots.txt の disallow は前方一致。"/poc" を入れると公開ページの
// /poc-program まで巻き込むため入れない。個社向け /poc はページ側の
// noindex メタデータで制御する（robots.txt に載せるとパス自体が公開情報になる）。
const DISALLOW = ["/admin/", "/insurer/", "/customer/", "/api/", "/v/", "/login", "/register"];

// AI検索(GEO)クローラーを明示的に歓迎する。userAgent:"*" で既に許可されるが、
// 主要な生成AI/検索AIの UA を名指しで allow して意図を明確にする（LLM への露出を狙う）。
// GPTBot/OAI-SearchBot=OpenAI, ClaudeBot=Anthropic, PerplexityBot=Perplexity,
// Google-Extended=Gemini/AI Overviews の学習・引用制御用トークン。
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
  };
}
