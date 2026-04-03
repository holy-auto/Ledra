"use client";

import { useState, useEffect } from "react";

interface AcademyCase {
  id: string;
  category: string;
  difficulty: number;
  quality_score: number;
  tags: string[];
  ai_summary: string | null;
  good_points: string[];
  caution_points: string[];
  is_candidate: boolean;
  is_published: boolean;
  view_count: number;
  helpful_count: number;
  created_at: string;
}

const CATEGORIES = [
  { value: "", label: "すべて" },
  { value: "ppf", label: "PPF" },
  { value: "coating", label: "コーティング" },
  { value: "body_repair", label: "ボディリペア" },
  { value: "maintenance", label: "メンテナンス" },
];

const DIFFICULTY_STARS = (d: number) => "★".repeat(d) + "☆".repeat(5 - d);

const scoreColor = (score: number) =>
  score >= 90
    ? "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20"
    : score >= 75
      ? "text-green-400 bg-green-400/10 border border-green-400/20"
      : score >= 50
        ? "text-accent bg-accent/10 border border-accent/20"
        : "text-muted bg-inset border border-border-subtle";

export default function AcademyCasesPage() {
  const [tab, setTab] = useState<"published" | "candidates">("published");
  const [category, setCategory] = useState("");
  const [cases, setCases] = useState<AcademyCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchCases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: tab });
      if (category) params.set("category", category);
      const res = await fetch(`/api/admin/academy/cases?${params}`);
      const data = await res.json();
      setCases(data.cases ?? []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [tab, category]);

  const handlePublish = async (caseId: string) => {
    setPublishing(caseId);
    try {
      const res = await fetch("/api/admin/academy/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, action: "publish" }),
      });
      if (res.ok) await fetchCases();
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <a href="/admin/academy" className="text-sm text-accent hover:underline">
          ← Academy
        </a>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">
          <span>📚</span> 施工事例ライブラリ
        </h1>
        <p className="text-sm text-muted mt-1">優良施工事例から学習。自テナントの候補事例をAcademyに登録できます。</p>
      </div>

      {/* タブ + フィルター */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-inset rounded-lg p-1">
          <button
            onClick={() => setTab("published")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === "published" ? "bg-surface text-primary font-medium shadow-sm" : "text-muted hover:text-secondary"
            }`}
          >
            📖 公開事例
          </button>
          <button
            onClick={() => setTab("candidates")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === "candidates" ? "bg-surface text-primary font-medium shadow-sm" : "text-muted hover:text-secondary"
            }`}
          >
            🌟 候補事例
          </button>
        </div>
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
      </div>

      {/* 候補バナー */}
      {tab === "candidates" && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-xl text-xs text-accent">
          品質スコア80以上・写真4枚以上の証明書が自動的に候補として登録されます。
          「公開する」ボタンでAIが要約を生成し、全加盟店が閲覧できる公開事例になります。
        </div>
      )}

      {/* コンテンツ */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm">
            {tab === "candidates"
              ? "候補事例がありません。品質スコア80以上の証明書を発行すると自動登録されます。"
              : "公開事例はまだありません。"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div key={c.id} className="glass-card hover:border-accent/40 transition-colors">
              {/* カードヘッダー */}
              <div
                className="p-4 cursor-pointer flex items-start justify-between gap-3"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-full">
                      {c.category}
                    </span>
                    {c.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 bg-inset text-secondary border border-border-subtle rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="text-xs text-yellow-400">{DIFFICULTY_STARS(c.difficulty)}</span>
                  </div>
                  <p className="text-sm text-secondary line-clamp-2">{c.ai_summary ?? "AI要約なし"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-bold px-2 py-1 rounded-lg ${scoreColor(c.quality_score)}`}>
                    {c.quality_score}
                  </span>
                  {tab === "candidates" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePublish(c.id);
                      }}
                      disabled={publishing === c.id}
                      className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-400 disabled:opacity-50 transition-colors"
                    >
                      {publishing === c.id ? "処理中..." : "公開する"}
                    </button>
                  )}
                  <span className="text-muted text-xs">{expanded === c.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* 展開コンテンツ */}
              {expanded === c.id && (
                <div className="px-4 pb-4 border-t border-border-subtle pt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {c.good_points.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-green-400 mb-2">✅ 良かった点</h3>
                        <ul className="space-y-1">
                          {c.good_points.map((p, i) => (
                            <li key={i} className="text-xs text-secondary flex gap-1">
                              <span className="text-green-400 shrink-0">•</span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.caution_points.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-orange-400 mb-2">⚠️ 注意点</h3>
                        <ul className="space-y-1">
                          {c.caution_points.map((p, i) => (
                            <li key={i} className="text-xs text-secondary flex gap-1">
                              <span className="text-orange-400 shrink-0">•</span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span>👁 {c.view_count}</span>
                    <span>👍 {c.helpful_count}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
