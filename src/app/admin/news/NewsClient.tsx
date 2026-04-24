"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string | null;
  published_at: string;
  keywords?: string[];
  saved?: boolean;
}

const SOURCE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  日本塗装時報: "danger",
  PPF専門店: "warning",
  レスポンス: "info",
  "Car Watch": "success",
  "WEB CARTOP": "info",
  ベストカー: "default",
  くるまのニュース: "success",
  clicccar: "default",
  // スクレイピングソース
  KeePer技研: "success",
  "日整連（JASPA）": "danger",
  "国土交通省（自動車）": "danger",
  JAF: "info",
  "STEK Japan": "warning",
  "XPEL Japan": "warning",
  GAZOO: "info",
  // 法改正・行政
  "国交省（リコール）": "danger",
  "環境省（自動車排出ガス）": "danger",
  "国交省（道路局）": "danger",
  // 海外
  "Automotive News": "info",
  "Just Auto": "info",
  "Green Car Reports": "success",
  Autoblog: "info",
  "BodyShop Business": "warning",
  "Fender Bender": "warning",
  "SEMA Show": "success",
  "IDA（国際ディテイリング協会）": "success",
  Automechanika: "info",
};

export default function NewsClient() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [feedCount, setFeedCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const fetchNews = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/news");
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setNews(j.news ?? []);
      setFeedCount(j.feedCount ?? 0);
      setSavedCount(j.savedCount ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchNews();
      setLoading(false);
    })();
  }, [fetchNews]);

  const sources = Array.from(new Set(news.map((n) => n.source)));
  const categories = Array.from(new Set(news.map((n) => n.category)));

  // カテゴリをグループ化
  const CATEGORY_GROUPS: Record<string, string[]> = {
    国内ニュース: ["自動車ニュース", "塗装・コーティング", "PPF", "コーティング", "整備業界", "自動車団体"],
    "法改正・規制": ["法改正・規制", "行政・規制"],
    海外動向: ["海外動向", "海外EV動向", "海外・板金塗装", "海外・展示会", "海外・ディテイリング"],
  };

  const afterSavedFilter = showSavedOnly ? news.filter((n) => n.saved) : news;
  const afterCategoryFilter =
    categoryFilter === "all"
      ? afterSavedFilter
      : CATEGORY_GROUPS[categoryFilter]
        ? afterSavedFilter.filter((n) => CATEGORY_GROUPS[categoryFilter].includes(n.category))
        : afterSavedFilter.filter((n) => n.category === categoryFilter);
  const filtered =
    sourceFilter === "all" ? afterCategoryFilter : afterCategoryFilter.filter((n) => n.source === sourceFilter);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        tag="業界ニュース"
        title="業界ニュース"
        description={`自動車業界の最新ニュースをRSSフィードから自動取得（${feedCount}サイト・保存済み${savedCount}件）毎朝7時に自動収集`}
      />

      {loading && (
        <div className="glass-card p-8 text-center space-y-2">
          <div className="text-sm text-muted">RSSフィードを取得中...</div>
          <div className="text-xs text-muted">複数のニュースサイトから最新記事を収集しています</div>
        </div>
      )}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && (
        <>
          {/* Source filter */}
          <section className="glass-card p-5 space-y-3">
            {/* Saved toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  !showSavedOnly ? "bg-primary text-inverse" : "bg-surface-hover text-secondary hover:bg-border-default"
                }`}
                onClick={() => setShowSavedOnly(false)}
              >
                すべて
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  showSavedOnly ? "bg-success text-inverse" : "bg-surface-hover text-secondary hover:bg-border-default"
                }`}
                onClick={() => setShowSavedOnly(true)}
              >
                業界関連のみ ({news.filter((n) => n.saved).length})
              </button>
            </div>
            {/* Category group buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  categoryFilter === "all"
                    ? "bg-violet text-inverse"
                    : "bg-surface-hover text-secondary hover:bg-border-default"
                }`}
                onClick={() => setCategoryFilter("all")}
              >
                全カテゴリ
              </button>
              {Object.keys(CATEGORY_GROUPS).map((group) => (
                <button
                  key={group}
                  type="button"
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === group
                      ? "bg-violet text-inverse"
                      : "bg-surface-hover text-secondary hover:bg-border-default"
                  }`}
                  onClick={() => setCategoryFilter(group)}
                >
                  {group === "国内ニュース" ? "🇯🇵 国内" : group === "法改正・規制" ? "⚖️ 法改正" : "🌍 海外"}
                </button>
              ))}
            </div>
            {/* Source buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sourceFilter === "all"
                    ? "bg-accent text-inverse"
                    : "bg-surface-hover text-secondary hover:bg-border-default"
                }`}
                onClick={() => setSourceFilter("all")}
              >
                全ソース ({afterSavedFilter.length})
              </button>
              {sources.map((src) => {
                const count = news.filter((n) => n.source === src).length;
                return (
                  <button
                    key={src}
                    type="button"
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      sourceFilter === src
                        ? "bg-accent text-inverse"
                        : "bg-surface-hover text-secondary hover:bg-border-default"
                    }`}
                    onClick={() => setSourceFilter(src)}
                  >
                    {src} ({count})
                  </button>
                );
              })}
            </div>
          </section>

          {/* News list */}
          <section className="space-y-3">
            {filtered.length === 0 && (
              <div className="glass-card p-8 text-center text-muted">
                ニュースを取得できませんでした。しばらくしてからもう一度お試しください。
              </div>
            )}

            {filtered.map((item) => (
              <article
                key={item.id}
                className={`glass-card p-5 space-y-2 hover:bg-surface-hover transition-colors ${item.saved ? "border-l-2 border-l-success" : ""}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={SOURCE_VARIANT[item.source] ?? "default"}>{item.source}</Badge>
                  {item.saved && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-success-dim text-success-text font-medium">
                      自動収集
                    </span>
                  )}
                  <span className="text-[11px] text-muted">
                    {new Date(item.published_at).toLocaleDateString("ja-JP")}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-primary leading-relaxed">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline hover:text-accent"
                    >
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                </h3>
                {item.summary && <p className="text-[13px] text-secondary leading-relaxed">{item.summary}</p>}
                {item.keywords && item.keywords.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {item.keywords.slice(0, 5).map((kw) => (
                      <span key={kw} className="px-1.5 py-0.5 rounded text-[10px] bg-accent-dim text-accent">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
