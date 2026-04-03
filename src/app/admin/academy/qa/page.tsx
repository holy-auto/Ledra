"use client";

import { useState } from "react";

interface QASource {
  type: string;
  title: string;
  snippet: string;
}

interface QAAnswer {
  answer: string;
  sources: QASource[];
  relatedCaseIds: string[];
  followUpQuestions: string[];
}

const CATEGORIES = [
  { value: "", label: "全カテゴリ" },
  { value: "ppf", label: "PPFフィルム" },
  { value: "coating", label: "ボディコーティング" },
  { value: "body_repair", label: "ボディリペア" },
  { value: "maintenance", label: "メンテナンス" },
  { value: "glass", label: "ガラス施工" },
];

export default function AcademyQAPage() {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<QAAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ question: string; answer: QAAnswer }>>([]);

  const handleSubmit = async (q?: string) => {
    const query = q ?? question;
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/admin/academy/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, category: category || undefined }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "エラーが発生しました");

      setAnswer(data.answer);
      setHistory((prev) => [{ question: query, answer: data.answer }, ...prev.slice(0, 9)]);
      setQuestion("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <a href="/admin/academy" className="text-sm text-accent hover:underline">
          ← Academy
        </a>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">
          <span>💬</span> 施工QAアシスタント
        </h1>
        <p className="text-sm text-muted mt-1">
          施工に関する質問をAIに質問できます。Academy事例とマニュアルを参照して回答します。
        </p>
      </div>

      {/* 質問フォーム */}
      <div className="glass-card p-5 mb-6">
        <div className="flex gap-3 mb-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            placeholder="例: アルファードのルーフにPPFを貼る時の注意点は？"
            className="flex-1 bg-inset border border-border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
            rows={3}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !question.trim()}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
          >
            {loading ? "生成中..." : "質問する"}
          </button>
        </div>
        <p className="text-xs text-muted mt-2">Cmd+Enter でも送信できます</p>
      </div>

      {/* エラー */}
      {error && (
        <div className="mb-4 p-3 bg-red-400/10 border border-red-400/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="glass-card p-6 mb-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">Academy事例とマニュアルを検索中...</span>
        </div>
      )}

      {/* 回答 */}
      {answer && (
        <div className="glass-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-medium text-secondary">AIの回答</span>
          </div>
          <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap mb-4">{answer.answer}</p>

          {/* 参照ソース */}
          {answer.sources.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="text-xs font-medium text-muted mb-2">参照した情報</p>
              {answer.sources.map((s, i) => (
                <div key={i} className="text-xs text-muted mb-1">
                  [{i + 1}] <span className="text-secondary">{s.snippet}</span>
                </div>
              ))}
            </div>
          )}

          {/* 関連質問 */}
          {answer.followUpQuestions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="text-xs font-medium text-muted mb-2">関連する質問</p>
              <div className="flex flex-wrap gap-2">
                {answer.followUpQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuestion(q);
                      handleSubmit(q);
                    }}
                    className="text-xs px-3 py-1 bg-accent/10 text-accent border border-accent/20 rounded-full hover:bg-accent/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 質問履歴 */}
      {history.length > 1 && (
        <div>
          <h2 className="text-sm font-medium text-muted mb-3">質問履歴</h2>
          <div className="space-y-3">
            {history.slice(1).map((item, i) => (
              <div key={i} className="bg-inset rounded-xl p-4 border border-border-subtle">
                <button
                  onClick={() => {
                    setQuestion(item.question);
                    setAnswer(item.answer);
                  }}
                  className="text-sm font-medium text-accent hover:underline text-left mb-1"
                >
                  Q: {item.question}
                </button>
                <p className="text-xs text-muted line-clamp-2">{item.answer.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
