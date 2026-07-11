"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { ONBOARDING_QUESTIONS, buildKnowledgeEntries } from "./lineKnowledgeOnboardingQuestions";

const API = "/api/admin/settings/line-knowledge";

// ponytail: 「あとで」の記憶はブラウザ単位 (localStorage、既存の ledra_ プレフィックス
// 規約に合わせる)。別端末では再表示されるが、ナレッジを1件でも登録すればサーバー側
// ゲート (messages/page.tsx) が全端末で非表示にするので許容。
const DISMISS_KEY = "ledra_line_knowledge_onboarding_dismissed";

/**
 * LINE ナレッジの初回学習カード (メッセージ受信箱の上部)。
 *
 * 表示するかどうか (編集権限 + ナレッジ 0 件) はサーバー側 (messages/page.tsx) が
 * 判定済み。ここでは「あとで」のローカル記憶だけを見る。固定質問 (営業時間・住所・
 * 電話番号・代車など) に答えるだけで最低限の学習を済ませ、以降の追加学習は
 * 店舗設定 > LINEナレッジ に誘導する。
 */
export default function LineKnowledgeOnboardingCard() {
  // idle=判定中 / form=質問フォーム / done=完了メッセージ / hidden=非表示 (あとで)
  const [phase, setPhase] = useState<"idle" | "form" | "done" | "hidden">("idle");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPhase(window.localStorage.getItem(DISMISS_KEY) ? "hidden" : "form");
    } catch {
      setPhase("form");
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage 不可でもこのセッション中は隠す
    }
    setPhase("hidden");
  }

  /**
   * 回答済みの質問を 1 件ずつ登録する。成功した回答は answers から取り除くため、
   * 一部失敗後のリトライでは残り (失敗分) だけが再送され、重複登録にならない。
   * 全件成功したときだけ完了画面に進む — 部分失敗を成功として見せない。
   *
   * ponytail: POST は既存 API を 1 件ずつ直列で叩く (最大 6 リクエスト)。初回
   * オンボーディングで一度きりなので許容。頻度が上がるなら entries 配列を受ける
   * バッチ POST を API 側に足す。
   */
  async function handleSave() {
    const entries = buildKnowledgeEntries(answers);
    if (entries.length === 0) return;
    setSaving(true);
    setError(null);
    const failedTitles: string[] = [];
    let saved = 0;
    for (const q of ONBOARDING_QUESTIONS) {
      const content = (answers[q.key] ?? "").trim();
      if (!content) continue;
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: q.title, content }),
        });
        if (res.ok) {
          saved += 1;
          setAnswers((prev) => {
            const next = { ...prev };
            delete next[q.key];
            return next;
          });
        } else {
          const j = await parseJsonSafe(res);
          failedTitles.push(`${q.title}${j?.message ? ` (${j.message})` : ""}`);
        }
      } catch {
        failedTitles.push(q.title);
      }
    }
    setSavedCount((prev) => prev + saved);
    if (failedTitles.length === 0) {
      setPhase("done");
    } else {
      setError(`保存できなかった項目があります: ${failedTitles.join(" / ")}。もう一度お試しください。`);
    }
    setSaving(false);
  }

  if (phase === "idle" || phase === "hidden") return null;

  if (phase === "done") {
    return (
      <section className="glass-card p-5">
        <div className="text-base font-semibold text-primary">✅ {savedCount} 件のナレッジを学習させました</div>
        <p className="mt-1 text-xs text-muted">
          追加の学習はいつでも 店舗設定 &gt; LINEナレッジ から。自動返信を始めるには AI 自動入力設定を ON
          にしてください。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/settings/line-knowledge" className="btn-secondary">
            💬 LINEナレッジを開く →
          </Link>
          <Link href="/admin/settings/ai-automation" className="btn-secondary">
            ✨ AI 自動入力の設定を開く →
          </Link>
        </div>
      </section>
    );
  }

  const answeredCount = buildKnowledgeEntries(answers).length;

  return (
    <section className="glass-card p-5">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted">はじめての学習</div>
      <div className="mt-1 text-base font-semibold text-primary">LINE の AI 自動返信に、お店のことを教えましょう</div>
      <p className="mt-1 text-xs text-muted">
        よくある質問に答えるだけで、AI がお客様からの LINE に自動で答えられるようになります。分かるものだけで構いません
        (空欄はスキップされます)。
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {ONBOARDING_QUESTIONS.map((q) => (
          <div key={q.key}>
            <label className="mb-1 block text-xs font-medium text-secondary">{q.title}</label>
            <textarea
              className="input-field w-full"
              rows={2}
              maxLength={2000}
              placeholder={q.placeholder}
              value={answers[q.key] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {savedCount > 0 && !error && <p className="mt-2 text-xs text-muted">{savedCount} 件は保存済みです。</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={saving || answeredCount === 0} onClick={handleSave}>
          {saving ? "学習中…" : `この内容で学習させる (${answeredCount}件)`}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={dismiss}>
          あとで (設定から登録する)
        </button>
      </div>
    </section>
  );
}
