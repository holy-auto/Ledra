"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Lesson {
  id: string;
  tenant_id: string | null;
  author_user_id: string;
  category: string;
  level: "intro" | "basic" | "standard" | "pro";
  difficulty: number;
  title: string;
  summary: string | null;
  body: string;
  video_url: string | null;
  cover_image_url: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  published_at: string | null;
  view_count: number;
  rating_avg: number;
  rating_count: number;
}

interface MyRating {
  rating: number;
  comment: string | null;
}

interface MyCompletion {
  completed_at: string;
  score_earned: number;
}

interface MyQuizBest {
  score: number;
  total: number;
  passed: boolean;
  attempted_at: string;
}

const LEVEL_LABEL: Record<string, string> = {
  intro: "入門",
  basic: "基礎",
  standard: "標準",
  pro: "応用",
};

export default function AcademyLessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [myRating, setMyRating] = useState<MyRating | null>(null);
  const [myCompletion, setMyCompletion] = useState<MyCompletion | null>(null);
  const [quizQuestionCount, setQuizQuestionCount] = useState(0);
  const [myQuizBest, setMyQuizBest] = useState<MyQuizBest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // rating UI state
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  useEffect(() => {
    let canceled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/academy/lessons/${id}`);
        const data = await res.json();
        if (canceled) return;
        if (!res.ok) {
          setError(data.message ?? "読み込みに失敗しました");
          return;
        }
        setLesson(data.lesson);
        setMyRating(data.my_rating);
        setMyCompletion(data.my_completion);
        setQuizQuestionCount(data.quiz_question_count ?? 0);
        setMyQuizBest(data.my_quiz_best);
        if (data.my_rating) {
          setRatingValue(data.my_rating.rating);
          setRatingComment(data.my_rating.comment ?? "");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [id]);

  const submitRating = async () => {
    if (ratingValue < 1) return;
    setSubmittingRating(true);
    try {
      const res = await fetch(`/api/admin/academy/lessons/${id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment }),
      });
      const data = await res.json();
      if (res.ok) {
        setMyRating({ rating: ratingValue, comment: ratingComment || null });
        // 平均を再取得
        const r = await fetch(`/api/admin/academy/lessons/${id}`);
        const d = await r.json();
        if (r.ok) setLesson(d.lesson);
      } else {
        alert(data.message ?? "評価の送信に失敗しました");
      }
    } finally {
      setSubmittingRating(false);
    }
  };

  const toggleCompletion = async () => {
    setSubmittingCompletion(true);
    try {
      if (myCompletion) {
        const res = await fetch(`/api/admin/academy/lessons/${id}/complete`, { method: "DELETE" });
        if (res.ok) setMyCompletion(null);
        else alert("完了の取り消しに失敗しました");
      } else {
        const res = await fetch(`/api/admin/academy/lessons/${id}/complete`, { method: "POST" });
        const data = await res.json();
        if (res.ok) {
          setMyCompletion({
            completed_at: new Date().toISOString(),
            score_earned: data.score_earned ?? 0,
          });
        } else {
          alert(data.message ?? "完了マークに失敗しました");
        }
      }
    } finally {
      setSubmittingCompletion(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("このレッスンを削除します。よろしいですか?")) return;
    const res = await fetch(`/api/admin/academy/lessons/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/academy/learn");
    else alert("削除に失敗しました");
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-warning">{error ?? "レッスンが見つかりません"}</p>
        <Link href="/admin/academy/learn" className="text-sm text-accent hover:underline mt-4 inline-block">
          ← 一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Link href="/admin/academy/learn" className="text-sm text-accent hover:underline">
          ← オンライン学習
        </Link>
      </div>

      {/* メタ */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs px-2 py-0.5 bg-accent/10 border border-accent/20 rounded-full text-accent">
          {LEVEL_LABEL[lesson.level] ?? lesson.level}
        </span>
        <span className="text-xs px-2 py-0.5 bg-inset border border-border-subtle rounded-full text-secondary">
          {lesson.category}
        </span>
        {!lesson.tenant_id && (
          <span className="text-xs px-2 py-0.5 bg-accent/10 border border-accent/30 rounded-full text-accent">
            運営
          </span>
        )}
        {lesson.status === "draft" && (
          <span className="text-xs px-2 py-0.5 bg-warning-dim border border-warning/30 text-warning rounded-full">
            下書き
          </span>
        )}
        {lesson.tags.map((t) => (
          <span key={t} className="text-xs px-2 py-0.5 bg-inset border border-border-subtle rounded-full text-muted">
            #{t}
          </span>
        ))}
      </div>

      <h1 className="text-2xl font-bold text-primary mb-2">{lesson.title}</h1>

      <div className="flex items-center gap-4 text-xs text-muted mb-6">
        <span>
          <span className="text-yellow-400">{"★".repeat(Math.round(lesson.rating_avg))}</span>
          <span className="text-border-subtle">{"★".repeat(5 - Math.round(lesson.rating_avg))}</span>
          <span className="ml-1">({lesson.rating_count})</span>
        </span>
        <span>{lesson.view_count}</span>
        <span className="text-yellow-400">難易度 {"★".repeat(lesson.difficulty)}</span>
      </div>

      {lesson.cover_image_url && (
        <Image
          src={lesson.cover_image_url}
          alt={lesson.title}
          width={1200}
          height={630}
          unoptimized
          className="w-full h-auto rounded-xl mb-6 border border-border-subtle"
        />
      )}

      {lesson.summary && (
        <p className="text-sm text-secondary bg-inset border border-border-subtle rounded-xl p-4 mb-6">
          {lesson.summary}
        </p>
      )}

      {lesson.video_url && (
        <div className="mb-6">
          <a
            href={lesson.video_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/30 rounded-lg text-accent text-sm hover:bg-accent/20 transition-colors"
          >
            動画を再生
          </a>
        </div>
      )}

      {/* 本文 */}
      <article className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-primary leading-relaxed">
        {lesson.body}
      </article>

      {/* 編集導線 (作者向け) */}
      <div className="mt-8 flex items-center gap-2 flex-wrap">
        <Link
          href={`/admin/academy/learn/${id}/edit`}
          className="text-xs px-3 py-1.5 bg-inset border border-border-subtle rounded-lg text-secondary hover:bg-surface transition-colors"
        >
          編集
        </Link>
        <Link
          href={`/admin/academy/learn/${id}/quiz/edit`}
          className="text-xs px-3 py-1.5 bg-inset border border-border-subtle rounded-lg text-secondary hover:bg-surface transition-colors"
        >
          クイズを編集 {quizQuestionCount > 0 && `(${quizQuestionCount}問)`}
        </Link>
        <button
          onClick={handleDelete}
          className="text-xs px-3 py-1.5 bg-inset border border-border-subtle rounded-lg text-warning hover:bg-warning-dim transition-colors"
        >
          削除
        </button>
      </div>

      {/* クイズ */}
      {lesson.status === "published" && quizQuestionCount > 0 && (
        <div className="mt-10 glass-card p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <h2 className="font-semibold text-primary mb-1 flex items-center gap-2">理解度チェック</h2>
              <p className="text-xs text-muted">
                {quizQuestionCount} 問・70% 以上で合格 → レッスン完了が自動マークされます
              </p>
            </div>
            <Link
              href={`/admin/academy/learn/${id}/quiz`}
              className="shrink-0 text-sm px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              {myQuizBest ? "もう一度挑戦" : "クイズに挑戦"}
            </Link>
          </div>
          {myQuizBest && (
            <div className="mt-3 p-3 bg-inset border border-border-subtle rounded-lg text-xs flex items-center gap-3">
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${
                  myQuizBest.passed
                    ? "bg-success-dim text-success border border-success/30"
                    : "bg-warning-dim text-warning border border-warning/30"
                }`}
              >
                {myQuizBest.passed ? "✓ 合格" : "未合格"}
              </span>
              <span className="text-secondary">
                ベスト: {myQuizBest.score} / {myQuizBest.total}
              </span>
              <span className="text-muted">{new Date(myQuizBest.attempted_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}

      {/* 完了マーク */}
      {lesson.status === "published" && (
        <div className="mt-10 glass-card p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-primary mb-1">学習の進捗を記録</h2>
            <p className="text-xs text-muted">
              {myCompletion
                ? `${new Date(myCompletion.completed_at).toLocaleDateString()} に完了。+${myCompletion.score_earned} pt 獲得済み`
                : quizQuestionCount > 0
                  ? "クイズに合格すると自動的に完了マークされます"
                  : "完了マークを押すとレベルに応じてスコアを獲得できます"}
            </p>
          </div>
          {/* クイズがある場合は手動マーク不可 (クイズ合格で自動マーク)。完了済みなら取り消しのみ可 */}
          {(quizQuestionCount === 0 || myCompletion) && (
            <button
              onClick={toggleCompletion}
              disabled={submittingCompletion}
              className={`text-sm px-5 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                myCompletion
                  ? "bg-success-dim border border-success/30 text-success hover:bg-success/20"
                  : "bg-accent text-white hover:bg-accent/90"
              }`}
            >
              {submittingCompletion ? "..." : myCompletion ? "✓ 完了済み" : "完了する"}
            </button>
          )}
        </div>
      )}

      {/* 評価 */}
      {lesson.status === "published" && (
        <div className="mt-10 glass-card p-5">
          <h2 className="font-semibold text-primary mb-3">このレッスンを評価</h2>
          <p className="text-xs text-muted mb-3">
            高評価のレッスンを投稿した加盟店には割引・報酬を還元する予定です。先人へのリスペクトを込めて。
          </p>
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRatingValue(n)}
                className={`text-2xl transition-transform hover:scale-110 ${
                  n <= ratingValue ? "text-yellow-400" : "text-border-subtle"
                }`}
                aria-label={`${n}つ星`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder="コメント (任意)"
            rows={3}
            maxLength={1000}
            className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted">{myRating ? "更新します" : "送信すると平均評価に反映されます"}</span>
            <button
              onClick={submitRating}
              disabled={ratingValue < 1 || submittingRating}
              className="text-sm px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {submittingRating ? "送信中..." : myRating ? "評価を更新" : "評価を送信"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
