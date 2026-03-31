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

const GRADE_CONFIG: Record<string, { label: string; border: string; textCls: string; bgCls: string }> = {
  S: { label: "最優秀", border: "border-yellow-400/50", textCls: "text-yellow-400", bgCls: "bg-yellow-400/10" },
  A: { label: "優良", border: "border-green-400/50", textCls: "text-green-400", bgCls: "bg-green-400/10" },
  B: { label: "良好", border: "border-accent/50", textCls: "text-accent", bgCls: "bg-accent/10" },
  C: { label: "基準未達", border: "border-orange-400/50", textCls: "text-orange-400", bgCls: "bg-orange-400/10" },
  D: { label: "要改善", border: "border-red-400/50", textCls: "text-red-400", bgCls: "bg-red-400/10" },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  high: { label: "重要", cls: "text-red-400 bg-red-400/10 border border-red-400/20" },
  medium: { label: "推奨", cls: "text-orange-400 bg-orange-400/10 border border-orange-400/20" },
  low: { label: "任意", cls: "text-green-400 bg-green-400/10 border border-green-400/20" },
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
      {/* ヘッダー */}
      <div className="mb-6">
        <a href="/admin/academy" className="text-sm text-accent hover:underline">
          ← Academy
        </a>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">
          <span>✏️</span> 証明書AI添削
        </h1>
        <p className="text-sm text-muted mt-1">証明書IDを入力してAIに品質評価・フィードバックを依頼します。</p>
      </div>

      {/* 入力フォーム */}
      <div className="glass-card p-5 mb-6">
        <label className="block text-sm font-medium text-secondary mb-2">証明書ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="証明書のUUID を入力"
            className="flex-1 bg-inset border border-border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !certId.trim()}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "解析中..." : "添削する"}
          </button>
        </div>
        <p className="text-xs text-muted mt-2">証明書詳細ページのURLからIDを確認できます</p>
      </div>

      {/* エラー */}
      {error && (
        <div className="mb-4 p-3 bg-red-400/10 border border-red-400/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="glass-card p-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">証明書を分析中...</span>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div className="space-y-4">
          {/* 総合評価 */}
          <div className={`rounded-xl border ${gradeConfig.border} ${gradeConfig.bgCls} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`text-5xl font-bold ${gradeConfig.textCls}`}>{grade}</div>
                <div>
                  <div className={`text-lg font-semibold ${gradeConfig.textCls}`}>{gradeConfig.label}</div>
                  <div className="text-sm text-secondary">品質スコア: {result.score}/100</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted mb-1">スコア</div>
                <div className="w-24 bg-inset rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      result.score >= 80 ? "bg-green-400" : result.score >= 60 ? "bg-accent" : "bg-red-400"
                    }`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-secondary italic">&quot; {result.encouragement}&quot;</p>
          </div>

          {/* Ledra Standard */}
          <div className="glass-card p-5">
            <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
              <span>🏆</span> Ledra Standard 達成状況
            </h2>
            <div className="flex gap-3 mb-3">
              {(["basic", "standard", "pro"] as const).map((lvl) => {
                const achieved = result.standardStatus[lvl];
                return (
                  <div
                    key={lvl}
                    className={`flex-1 rounded-xl p-3 border text-center transition-all ${
                      achieved ? "bg-green-400/10 border-green-400/40" : "bg-inset border-border-subtle opacity-40"
                    }`}
                  >
                    <div className={`text-lg ${achieved ? "opacity-100" : "opacity-30"}`}>
                      {lvl === "basic" ? "🥉" : lvl === "standard" ? "🥈" : "🥇"}
                    </div>
                    <div
                      className={`text-xs font-medium mt-1 capitalize ${achieved ? "text-green-400" : "text-muted"}`}
                    >
                      {lvl}
                    </div>
                    {achieved && <div className="text-xs text-green-400">✓ 達成</div>}
                  </div>
                );
              })}
            </div>
            <div className="text-sm text-accent bg-accent/10 rounded-xl p-3 border border-accent/20">
              <span className="font-medium">次のステップ: </span>
              {result.standardStatus.nextStep}
            </div>
          </div>

          {/* 良かった点 */}
          {result.strengths.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
                <span>✅</span> 良かった点
              </h2>
              <div className="space-y-2">
                {result.strengths.map((s, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-green-400 font-bold mt-0.5">+</span>
                    <div>
                      <span className="font-medium text-primary">{s.area}: </span>
                      <span className="text-secondary">{s.comment}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 改善点 */}
          {result.improvements.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
                <span>🔧</span> 改善点
              </h2>
              <div className="space-y-3">
                {result.improvements.map((item, i) => {
                  const pc = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.low;
                  return (
                    <div key={i} className="flex gap-3 p-3 bg-inset rounded-xl border border-border-subtle">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium self-start shrink-0 ${pc.cls}`}>
                        {pc.label}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-primary">
                          {item.area}: {item.issue}
                        </div>
                        <div className="text-sm text-secondary mt-1">→ {item.suggestion}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
