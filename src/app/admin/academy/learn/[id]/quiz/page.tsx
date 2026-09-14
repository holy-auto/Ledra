"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface Question {
  id: string;
  position: number;
  question: string;
  choices: string[];
}

interface ResultItem {
  question_id: string;
  selected_index: number | null;
  correct_index: number;
  is_correct: boolean;
  explanation: string | null;
}

interface AttemptResult {
  score: number;
  total: number;
  passed: boolean;
  pass_threshold: number;
  auto_completed: boolean;
  results: ResultItem[];
}

export default function QuizPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/academy/lessons/${id}/quiz`);
        const data = await res.json();
        if (canceled) return;
        if (!res.ok) {
          setError(data.message ?? "クイズの取得に失敗しました");
          return;
        }
        setQuestions(data.questions ?? []);
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [id]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        answers: Object.entries(answers).map(([qid, idx]) => ({
          question_id: qid,
          selected_index: idx,
        })),
      };
      const res = await fetch(`/api/admin/academy/lessons/${id}/quiz/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message ?? "送信に失敗しました");
        return;
      }
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setAnswers({});
    setResult(null);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-muted">{error ?? "このレッスンにはクイズがありません"}</p>
        <Link href={`/admin/academy/learn/${id}`} className="text-sm text-accent hover:underline mt-4 inline-block">
          ← レッスン詳細
        </Link>
      </div>
    );
  }

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);
  const resultMap = new Map(result?.results.map((r) => [r.question_id, r]) ?? []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/admin/academy/learn/${id}`} className="text-sm text-accent hover:underline">
          ← レッスン詳細
        </Link>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">
          <span>📝</span> 理解度チェック
        </h1>
        <p className="text-sm text-muted mt-1">
          {questions.length} 問・70% 以上で合格 → レッスン完了が自動マークされます
        </p>
      </div>

      {/* 結果 */}
      {result && (
        <div
          className={`mb-6 glass-card p-5 border ${
            result.passed ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className={`font-semibold text-lg ${result.passed ? "text-success" : "text-warning"}`}>
              {result.passed ? "🎉 合格!" : "もう一歩"}
            </h2>
            <div className={`text-2xl font-bold ${result.passed ? "text-success" : "text-warning"}`}>
              {result.score} / {result.total}
            </div>
          </div>
          <p className="text-sm text-secondary">
            {result.passed
              ? result.auto_completed
                ? "レッスン完了が自動マークされました。スコアと進捗に反映されています。"
                : "合格ライン (70%) を超えました。"
              : `合格には ${Math.ceil(result.total * result.pass_threshold)} 問以上の正解が必要です。`}
          </p>
          {!result.passed && (
            <button
              onClick={retry}
              className="mt-3 text-sm px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              もう一度挑戦する
            </button>
          )}
        </div>
      )}

      {/* 問題 */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const r = resultMap.get(q.id);
          return (
            <div key={q.id} className="glass-card p-5">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs text-muted">Q{idx + 1}</span>
                <h3 className="text-base font-medium text-primary">{q.question}</h3>
              </div>
              <div className="space-y-2">
                {q.choices.map((c, i) => {
                  const selected = answers[q.id] === i;
                  const isCorrect = r ? r.correct_index === i : false;
                  const isUserChoice = r ? r.selected_index === i : selected;
                  let cls = "border-border-subtle bg-inset hover:border-accent/40";
                  if (r) {
                    if (isCorrect) cls = "border-success/50 bg-success/10";
                    else if (isUserChoice && !isCorrect) cls = "border-warning/50 bg-warning/10";
                    else cls = "border-border-subtle bg-inset opacity-60";
                  } else if (selected) {
                    cls = "border-accent bg-accent/10";
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => !result && setAnswers({ ...answers, [q.id]: i })}
                      disabled={Boolean(result)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm text-primary ${cls}`}
                    >
                      <span className="text-muted mr-2">{String.fromCharCode(65 + i)}.</span>
                      {c}
                      {r && isCorrect && <span className="float-right text-success">✓ 正解</span>}
                      {r && isUserChoice && !isCorrect && (
                        <span className="float-right text-warning">あなたの回答</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {r?.explanation && (
                <div className="mt-3 p-3 bg-accent/5 border border-accent/20 rounded-lg text-xs text-secondary">
                  <span className="font-medium text-accent">解説: </span>
                  {r.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!result && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!allAnswered || submitting}
            className="text-sm px-5 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? "採点中..." : `回答を提出 (${Object.keys(answers).length}/${questions.length})`}
          </button>
          {!allAnswered && (
            <span className="text-xs text-muted">
              すべての問題に回答してください ({questions.length - Object.keys(answers).length} 問残り)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
