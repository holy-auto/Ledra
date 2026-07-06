"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

interface Lesson {
  id: string;
  tenant_id: string | null;
  category: string;
  level: "intro" | "basic" | "standard" | "pro";
  difficulty: number;
  title: string;
  summary: string | null;
  cover_image_url: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  view_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

interface RankedLesson extends Lesson {
  score: number;
}

const CATEGORIES = [
  { value: "", label: "すべて" },
  { value: "general", label: "全般" },
  { value: "ppf", label: "PPF" },
  { value: "coating", label: "コーティング" },
  { value: "body_repair", label: "ボディリペア" },
  { value: "maintenance", label: "メンテナンス" },
];

const LEVELS = [
  { value: "", label: "すべて" },
  { value: "intro", label: "入門" },
  { value: "basic", label: "基礎" },
  { value: "standard", label: "標準" },
  { value: "pro", label: "応用" },
];

const LEVEL_BADGE: Record<string, string> = {
  intro: "bg-success-dim text-success border-success/20",
  basic: "bg-accent/10 text-accent border-accent/20",
  standard: "bg-purple-500/10 text-purple-300 border-purple-400/20",
  pro: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
};

const LEVEL_LABEL: Record<string, string> = {
  intro: "入門",
  basic: "基礎",
  standard: "標準",
  pro: "応用",
};

const RANK_MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

function StarRating({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-yellow-400 text-xs">
      {"★".repeat(full)}
      <span className="text-muted">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function RankingSection({ category }: { category: string }) {
  const [ranked, setRanked] = useState<RankedLesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ type: "lessons", limit: "5" });
        if (category) params.set("category", category);
        const res = await fetch(`/api/admin/academy/rankings?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!canceled) setRanked(data.lessons ?? []);
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [category]);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="shrink-0 w-56 h-28 glass-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (ranked.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
        <span>🏆</span>
        {category
          ? `${CATEGORIES.find((c) => c.value === category)?.label ?? category} ランキング`
          : "総合ランキング TOP 5"}
        <span className="text-xs text-muted font-normal">評価スコア順</span>
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {ranked.map((l, idx) => (
          <Link
            key={l.id}
            href={`/admin/academy/learn/${l.id}`}
            className="shrink-0 w-60 glass-card p-3 hover:border-accent/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-1 mb-1.5">
              <span className="text-lg">{RANK_MEDAL[idx] ?? `#${idx + 1}`}</span>
              <span className={`text-xs px-1.5 py-0.5 border rounded-full ${LEVEL_BADGE[l.level] ?? ""}`}>
                {LEVEL_LABEL[l.level] ?? l.level}
              </span>
            </div>
            <p className="text-sm font-semibold text-primary line-clamp-2 mb-2">{l.title}</p>
            <div className="flex items-center gap-2 text-xs text-muted">
              <StarRating value={l.rating_avg} />
              <span>({l.rating_count})</span>
              <span className="ml-auto text-accent font-medium">{l.score.toFixed(1)} pt</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AcademyLearnPage() {
  const [tab, setTab] = useState<"published" | "drafts" | "mine">("published");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [introOnly, setIntroOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const fetchLessons = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (category) params.set("category", category);
      if (level) params.set("level", level);
      const res = await fetch(`/api/admin/academy/lessons?${params}`);
      const data = await res.json();
      setLessons(data.lessons ?? []);
      setIntroOnly(Boolean(data.intro_only));
    } catch {
      setLessons([]);
      setIntroOnly(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLessons();
  }, [tab, category, level]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/academy/progress");
        if (!res.ok) return;
        const data = await res.json();
        setCompletedIds(new Set<string>(data.completed_lesson_ids ?? []));
      } catch {
        // noop
      }
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ヘッダー + タブ（L字シェルのページバー） */}
      <Link href="/admin/academy" className="text-sm text-accent hover:underline">
        ← Academy
      </Link>
      <div className="mt-2 mb-6">
        <PageHeader
          tag="アカデミー"
          title="📖 オンライン学習"
          description="運営・先輩加盟店のレッスンで知識を深めよう。良いレッスンへの評価は投稿者の報酬・割引につながります。"
          actions={
            <Link
              href="/admin/academy/learn/new"
              className="shrink-0 text-sm px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              + レッスン投稿
            </Link>
          }
          tabs={[
            { key: "published", label: "📚 公開レッスン" },
            { key: "drafts", label: "✏️ 下書き" },
            { key: "mine", label: "👤 自分の投稿" },
          ]}
          activeTab={tab}
          onTabSelect={(k) => setTab(k as "published" | "drafts" | "mine")}
        />
      </div>

      {/* ランキングセクション: published タブのみ */}
      {tab === "published" && <RankingSection category={category} />}

      {/* 入門ロック説明 */}
      {introOnly && tab === "published" && (
        <div className="mb-4 p-3 bg-warning-dim border border-warning/30 rounded-xl text-xs text-warning flex items-start gap-2">
          <span className="mt-0.5">🔒</span>
          <div>
            <p className="font-medium">入門レッスンのみ表示中</p>
            <p className="text-warning/70 mt-0.5">
              基礎以上のレッスンは Starter
              プラン以上で閲覧できます。先輩加盟店が積み上げた知見を尊重するための制限です。
            </p>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="flex items-center justify-end mb-4 flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="text-sm bg-inset border border-border-subtle rounded-lg px-3 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          disabled={tab === "published" && introOnly}
          className="text-sm bg-inset border border-border-subtle rounded-lg px-3 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
        >
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* レッスン一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lessons.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm">
            {tab === "drafts"
              ? "下書きはありません"
              : tab === "mine"
                ? "投稿したレッスンはありません"
                : "条件に合うレッスンが見つかりません"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lessons.map((l) => (
            <Link
              key={l.id}
              href={`/admin/academy/learn/${l.id}`}
              className="glass-card p-4 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 border rounded-full ${LEVEL_BADGE[l.level] ?? ""}`}>
                    {LEVEL_LABEL[l.level] ?? l.level}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-inset border border-border-subtle rounded-full text-secondary">
                    {l.category}
                  </span>
                  {!l.tenant_id && (
                    <span className="text-xs px-2 py-0.5 bg-accent/10 border border-accent/30 rounded-full text-accent">
                      運営
                    </span>
                  )}
                </div>
                {l.status === "draft" && (
                  <span className="text-xs px-2 py-0.5 bg-warning-dim border border-warning/30 text-warning rounded-full">
                    下書き
                  </span>
                )}
                {completedIds.has(l.id) && (
                  <span className="text-xs px-2 py-0.5 bg-success-dim border border-success/30 text-success rounded-full">
                    ✓ 完了
                  </span>
                )}
              </div>
              <h2 className="font-semibold text-primary line-clamp-2 mb-1">{l.title}</h2>
              {l.summary && <p className="text-sm text-secondary line-clamp-2 mb-3">{l.summary}</p>}
              <div className="flex items-center gap-3 text-xs text-muted">
                <StarRating value={l.rating_avg} />
                <span>({l.rating_count})</span>
                <span>👁 {l.view_count}</span>
                <span className="text-yellow-400">{"★".repeat(l.difficulty)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
