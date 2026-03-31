"use client";

import { useState, useCallback } from "react";

interface FeedbackStrength {
  area: string;
  comment: string;
}
interface FeedbackImprovement {
  area: string;
  issue: string;
  suggestion: string;
  priority: string;
}
interface StandardStatus {
  basic: boolean;
  standard: boolean;
  pro: boolean;
  nextStep: string;
}
interface FeedbackResult {
  overallGrade: string;
  score: number;
  strengths: FeedbackStrength[];
  improvements: FeedbackImprovement[];
  standardStatus: StandardStatus;
  encouragement: string;
}

const GRADE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  S: { label: "最優秀", bg: "bg-yellow-50", text: "text-yellow-600", border: "border-yellow-300" },
  A: { label: "優良", bg: "bg-green-50", text: "text-green-600", border: "border-green-300" },
  B: { label: "良好", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-300" },
  C: { label: "基準未達", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-300" },
  D: { label: "要改善", bg: "bg-red-50", text: "text-red-600", border: "border-red-300" },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-orange-600 bg-orange-50",
  low: "text-green-600 bg-green-50",
};

export default function AcademyFeedbackPage() {
  const [certId, setCertId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!certId.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/academy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificate_id: certId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "エラー");
      setResult(data.feedback);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [certId, loading]);

  const grade = result?.overallGrade ?? "";
  const gradeConfig = GRADE_CONFIG[grade] ?? GRADE_CONFIG.C;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <a href="/admin/academy" className="text-sm text-blue-600 hover:underline">
          ← Academy
        </a>
        <h1 className="text-xl font-bold text-gray-900 mt-2 flex items-center gap-2">
          <span>✏️</span> 証明書AI添削
        </h1>
        <p className="text-sm text-gray-500 mt-1">証明書IDを入力してAIに品質評価・フィードバックを依頼します。</p>
      </div>

      {/* 入力フォーム */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">証明書ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            placeholder="証明書のUUID を入力"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !certId.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "解析中..." : "添削する"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">証明書詳細ページのURLからIDを確認できます</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {loading && (
        <div className="bg-white rounded-xl border p-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">証明書を分析中...</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* 総合評価 */}
          <div className={`rounded-xl border ${gradeConfig.border} ${gradeConfig.bg} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`text-5xl font-bold ${gradeConfig.text}`}>{grade}</div>
                <div>
                  <div className={`text-lg font-semibold ${gradeConfig.text}`}>{gradeConfig.label}</div>
                  <div className="text-sm text-gray-500">品質スコア: {result.score}/100</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">スコア</div>
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${result.score >= 80 ? "bg-green-500" : result.score >= 60 ? "bg-blue-500" : "bg-red-400"}`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 italic">&quot; {result.encouragement}&quot;</p>
          </div>

          {/* Ledra Standard */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🏆</span> Ledra Standard 達成状況
            </h2>
            <div className="flex gap-3 mb-3">
              {(["basic", "standard", "pro"] as const).map((lvl) => {
                const achieved = result.standardStatus[lvl];
                return (
                  <div
                    key={lvl}
                    className={`flex-1 rounded-lg p-3 border text-center ${achieved ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"}`}
                  >
                    <div className={`text-lg ${achieved ? "opacity-100" : "opacity-30"}`}>
                      {lvl === "basic" ? "🥉" : lvl === "standard" ? "🥈" : "🥇"}
                    </div>
                    <div
                      className={`text-xs font-medium mt-1 capitalize ${achieved ? "text-green-700" : "text-gray-400"}`}
                    >
                      {lvl}
                    </div>
                    {achieved && <div className="text-xs text-green-600">✓ 達成</div>}
                  </div>
                );
              })}
            </div>
            <div className="text-sm text-blue-600 bg-blue-50 rounded-lg p-3">
              <span className="font-medium">次のステップ: </span>
              {result.standardStatus.nextStep}
            </div>
          </div>

          {/* 良かった点 */}
          {result.strengths.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span>✅</span> 良かった点
              </h2>
              <div className="space-y-2">
                {result.strengths.map((s, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-green-500 font-bold">+</span>
                    <div>
                      <span className="font-medium text-gray-700">{s.area}: </span>
                      <span className="text-gray-600">{s.comment}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 改善点 */}
          {result.improvements.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span>🔧</span> 改善点
              </h2>
              <div className="space-y-3">
                {result.improvements.map((item, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium self-start ${PRIORITY_COLORS[item.priority]}`}
                    >
                      {item.priority === "high" ? "重要" : item.priority === "medium" ? "推奨" : "任意"}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        {item.area}: {item.issue}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">→ {item.suggestion}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
