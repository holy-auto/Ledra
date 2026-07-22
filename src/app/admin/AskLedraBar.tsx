"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { parseJsonSafe } from "@/lib/api/safeJson";

type AskResult =
  { type: "link"; href: string; label: string } | { type: "answer"; answer: string; followUpQuestions: string[] };

/**
 * ダッシュボード最上部の自由入力欄。「どの画面を探せばいいか」を聞くと
 * 既知の画面なら AI を呼ばず即答し、施工技術の質問は qaAssistant にフォール
 * バックして回答する（/api/admin/ask）。90近い管理画面を自分で探す手間を
 * なくすための単一の入口。
 */
export default function AskLedraBar() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await parseJsonSafe<{ result?: AskResult; message?: string; error?: string }>(res);
      // apiError は機械可読コードを `error` に、ユーザー向け日本語文言を `message` に入れる。
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      if (json?.result) setResult(json.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-4" data-tour="ask-ledra">
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ledraに聞く（例:「請求書はどこ？」「コーティングの施工手順は？」）"
          className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-base px-4 py-2.5 text-sm text-primary placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "考え中…" : "聞く"}
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded-xl border border-danger/20 bg-danger-dim px-4 py-2 text-sm text-danger-text">
          {error}
        </div>
      )}

      {result?.type === "link" && (
        <div className="mt-3 text-sm">
          <Link href={result.href} className="font-medium text-accent hover:underline">
            → {result.label}へ移動
          </Link>
        </div>
      )}

      {result?.type === "answer" && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-primary">{result.answer}</p>
          {result.followUpQuestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.followUpQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="rounded-full border border-border-subtle px-3 py-1 text-xs text-secondary hover:bg-surface-hover"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
