"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Question {
  id?: string;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string | null;
}

const EMPTY_Q: Question = {
  question: "",
  choices: ["", ""],
  correct_index: 0,
  explanation: "",
};

export default function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

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
        setCanEdit(Boolean(data.can_edit));
        setQuestions(
          (data.questions ?? []).map((q: Question) => ({
            id: q.id,
            question: q.question,
            choices: q.choices,
            correct_index: q.correct_index ?? 0,
            explanation: q.explanation ?? "",
          })),
        );
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [id]);

  const updateQ = (idx: number, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const updateChoice = (qIdx: number, cIdx: number, val: string) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        const next = [...q.choices];
        next[cIdx] = val;
        return { ...q, choices: next };
      }),
    );
  };

  const addChoice = (qIdx: number) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        if (q.choices.length >= 6) return q;
        return { ...q, choices: [...q.choices, ""] };
      }),
    );
  };

  const removeChoice = (qIdx: number, cIdx: number) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        if (q.choices.length <= 2) return q;
        const next = q.choices.filter((_, j) => j !== cIdx);
        const newCorrect =
          q.correct_index === cIdx ? 0 : q.correct_index > cIdx ? q.correct_index - 1 : q.correct_index;
        return { ...q, choices: next, correct_index: newCorrect };
      }),
    );
  };

  const addQuestion = () => setQuestions((qs) => [...qs, { ...EMPTY_Q, choices: ["", ""] }]);
  const removeQuestion = (idx: number) => setQuestions((qs) => qs.filter((_, i) => i !== idx));
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((qs) => {
      const next = [...qs];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = async () => {
    // 軽いバリデーション
    for (const [i, q] of questions.entries()) {
      if (!q.question.trim()) {
        alert(`Q${i + 1} の質問文を入力してください`);
        return;
      }
      const filled = q.choices.filter((c) => c.trim()).length;
      if (filled < 2) {
        alert(`Q${i + 1} は選択肢を2つ以上入力してください`);
        return;
      }
      if (!q.choices[q.correct_index]?.trim()) {
        alert(`Q${i + 1} の正解の選択肢が空です`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        questions: questions.map((q) => ({
          question: q.question.trim(),
          choices: q.choices.map((c) => c.trim()).filter((c) => c.length > 0),
          correct_index: q.correct_index,
          explanation: q.explanation?.trim() || null,
        })),
      };
      const res = await fetch(`/api/admin/academy/lessons/${id}/quiz`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message ?? "保存に失敗しました");
        return;
      }
      router.push(`/admin/academy/learn/${id}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-warning">{error}</p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-warning">このクイズを編集する権限がありません</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/admin/academy/learn/${id}`} className="text-sm text-accent hover:underline">
          ← レッスン詳細
        </Link>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">
          <span>📝</span> クイズを編集
        </h1>
        <p className="text-sm text-muted mt-1">理解度チェック用の質問を作成・並び替え。70% 以上で合格 → 完了マーク。</p>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={idx} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted">Q{idx + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveQuestion(idx, -1)}
                  disabled={idx === 0}
                  className="text-xs px-2 py-1 bg-inset border border-border-subtle rounded disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveQuestion(idx, 1)}
                  disabled={idx === questions.length - 1}
                  className="text-xs px-2 py-1 bg-inset border border-border-subtle rounded disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeQuestion(idx)}
                  className="text-xs px-2 py-1 bg-inset border border-border-subtle rounded text-warning"
                >
                  削除
                </button>
              </div>
            </div>

            <input
              type="text"
              value={q.question}
              onChange={(e) => updateQ(idx, { question: e.target.value })}
              placeholder="質問文"
              maxLength={1000}
              className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary mb-3 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />

            <div className="space-y-2 mb-3">
              {q.choices.map((c, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted shrink-0">
                    <input
                      type="radio"
                      name={`correct-${idx}`}
                      checked={q.correct_index === ci}
                      onChange={() => updateQ(idx, { correct_index: ci })}
                    />
                    正解
                  </label>
                  <span className="text-xs text-muted shrink-0">{String.fromCharCode(65 + ci)}.</span>
                  <input
                    type="text"
                    value={c}
                    onChange={(e) => updateChoice(idx, ci, e.target.value)}
                    placeholder="選択肢"
                    maxLength={300}
                    className="flex-1 text-sm bg-inset border border-border-subtle rounded-lg px-3 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  {q.choices.length > 2 && (
                    <button
                      onClick={() => removeChoice(idx, ci)}
                      className="text-xs px-2 py-1 text-muted hover:text-warning"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {q.choices.length < 6 && (
                <button
                  onClick={() => addChoice(idx)}
                  className="text-xs px-3 py-1 bg-inset border border-border-subtle rounded text-secondary"
                >
                  + 選択肢を追加
                </button>
              )}
            </div>

            <textarea
              value={q.explanation ?? ""}
              onChange={(e) => updateQ(idx, { explanation: e.target.value })}
              placeholder="解説 (任意)"
              maxLength={2000}
              rows={2}
              className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={addQuestion}
          disabled={questions.length >= 30}
          className="text-sm px-4 py-2 bg-inset border border-border-subtle rounded-lg text-secondary hover:bg-surface disabled:opacity-50 transition-colors"
        >
          + 質問を追加
        </button>
        <span className="text-xs text-muted">{questions.length}/30 問</span>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm px-5 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={() => router.back()}
          className="text-sm px-4 py-2 bg-inset border border-border-subtle rounded-lg text-secondary hover:bg-surface transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
