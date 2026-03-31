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
      <div className="mb-6">
        <a href="/admin/academy" className="text-sm text-blue-600 hover:underline">← Academy</a>
        <h1 className="text-xl font-bold text-gray-900 mt-2 flex items-center gap-2">
          <span>💬</span> 施工QAアシスタント
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          施工に関する質問をAIに質問できます。Academy事例とマニュアルを参照して回答します。
        </p>
      </div>

      {/* 質問フォーム */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <div className="flex gap-3 mb-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 text-gray-700 bg-gray-50"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
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
            className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            rows={3}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !question.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            {loading ? "生成中..." : "質問する"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Cmd+Enter でも送信できます</p>
      </div>

      {/* エラー */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="bg-white rounded-xl border p-6 mb-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Academy事例とマニュアルを検索中...</span>
        </div>
      )}

      {/* 回答 */}
      {answer && (
        <div className="bg-white rounded-xl border p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-medium text-gray-700">AIの回答</span>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-4">
            {answer.answer}
          </p>

          {/* 参照ソース */}
          {answer.sources.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">参照した情報</p>
              {answer.sources.map((s, i) => (
                <div key={i} className="text-xs text-gray-400 mb-1">
                  [{i + 1}] <span className="text-gray-500">{s.snippet}</span>
                </div>
              ))}
            </div>
          )}

          {/* 関連質問 */}
          {answer.followUpQuestions.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">関連する質問</p>
              <div className="flex flex-wrap gap-2">
                {answer.followUpQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuestion(q);
                      handleSubmit(q);
                    }}
                    className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition"
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
          <h2 className="text-sm font-medium text-gray-500 mb-3">質問履歴</h2>
          <div className="space-y-3">
            {history.slice(1).map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 border">
                <button
                  onClick={() => {
                    setQuestion(item.question);
                    setAnswer(item.answer);
                  }}
                  className="text-sm font-medium text-blue-600 hover:underline text-left mb-1"
                >
                  Q: {item.question}
                </button>
                <p className="text-xs text-gray-500 line-clamp-2">{item.answer.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
