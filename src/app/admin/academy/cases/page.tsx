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

  const scoreColor = (score: number) =>
    score >= 90
      ? "text-yellow-600 bg-yellow-50"
      : score >= 75
        ? "text-green-600 bg-green-50"
        : score >= 50
          ? "text-blue-600 bg-blue-50"
          : "text-gray-500 bg-gray-50";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <a href="/admin/academy" className="text-sm text-blue-600 hover:underline">
          ← Academy
        </a>
        <h1 className="text-xl font-bold text-gray-900 mt-2 flex items-center gap-2">
          <span>📚</span> 施工事例ライブラリ
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          優良施工事例から学習。自テナントの候補事例をAcademyに登録できます。
        </p>
      </div>

      {/* タブ + フィルター */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("published")}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === "published" ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}
          >
            📖 公開事例
          </button>
          <button
            onClick={() => setTab("candidates")}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === "candidates" ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}
          >
            🌟 候補事例
          </button>
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="text-sm border rounded-lg px-3 py-1.5 text-gray-700"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {tab === "candidates" && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          品質スコア80以上・写真4枚以上の証明書が自動的に候補として登録されます。
          「公開する」ボタンでAIが要約を生成し、全加盟店が閲覧できる公開事例になります。
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
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
            <div key={c.id} className="bg-white rounded-xl border hover:border-blue-200 transition">
              <div
                className="p-4 cursor-pointer flex items-start justify-between gap-3"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{c.category}</span>
                    {c.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {tag}
                      </span>
                    ))}
                    <span className="text-xs text-yellow-500">{DIFFICULTY_STARS(c.difficulty)}</span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{c.ai_summary ?? "AI要約なし"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-bold px-2 py-1 rounded ${scoreColor(c.quality_score)}`}>
                    {c.quality_score}
                  </span>
                  {tab === "candidates" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePublish(c.id);
                      }}
                      disabled={publishing === c.id}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {publishing === c.id ? "処理中..." : "公開する"}
                    </button>
                  )}
                  <span className="text-gray-300">{expanded === c.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {expanded === c.id && (
                <div className="px-4 pb-4 border-t pt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {c.good_points.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-green-700 mb-2">✅ 良かった点</h3>
                        <ul className="space-y-1">
                          {c.good_points.map((p, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-1">
                              <span className="text-green-400">•</span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.caution_points.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-orange-700 mb-2">⚠️ 注意点</h3>
                        <ul className="space-y-1">
                          {c.caution_points.map((p, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-1">
                              <span className="text-orange-400">•</span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
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
