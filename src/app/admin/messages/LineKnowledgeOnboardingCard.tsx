"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { ONBOARDING_QUESTIONS, buildKnowledgeEntries } from "./lineKnowledgeOnboardingQuestions";

const API = "/api/admin/settings/line-knowledge";

// ponytail: 「あとで」の記憶はブラウザ単位 (localStorage)。別端末では再表示されるが、
// ナレッジを1件でも登録すれば全端末で出なくなるので許容。テナント単位で厳密に
// 記憶したくなったら tenant_ai_automation_settings 側にフラグを持たせる。
const DISMISS_KEY = "ledra:line-knowledge-onboarding:dismissed";

/**
 * LINE ナレッジの初回学習カード (メッセージ受信箱の上部)。
 *
 * ナレッジ未登録の管理者が受信箱を開いたとき、固定質問 (営業時間・住所・
 * 電話番号・代車など) に答えるだけで最低限の学習を済ませられる。
 * 完了後・スキップ後の追加学習は 店舗設定 > LINEナレッジ に誘導する。
 *
 * 表示条件: owner/admin + ナレッジ 0 件 + テーブル作成済み + 未スキップ。
 */
export default function LineKnowledgeOnboardingCard() {
  // idle=判定中 (何も出さない) / form=質問フォーム / done=完了メッセージ / hidden=非表示
  const [phase, setPhase] = useState<"idle" | "form" | "done" | "hidden">("idle");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY)) {
          if (!cancelled) setPhase("hidden");
          return;
        }
        const res = await fetch(API, { cache: "no-store" });
        const j = await parseJsonSafe(res);
        // 登録済み / テーブル未作成 / 読込失敗 / 権限なし (staff は role 無し) は出さない。
        const show =
          res.ok &&
          Array.isArray(j?.entries) &&
          j.entries.length === 0 &&
          !j?.warning &&
          (j?.role === "owner" || j?.role === "admin");
        if (!cancelled) setPhase(show ? "form" : "hidden");
      } catch {
        if (!cancelled) setPhase("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage 不可でもこのセッション中は隠す
    }
    setPhase("hidden");
  }

  async function handleSave() {
    const entries = buildKnowledgeEntries(answers);
    if (entries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      let saved = 0;
      for (const entry of entries) {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
        if (res.ok) {
          saved += 1;
        } else {
          const j = await parseJsonSafe(res);
          setError((j?.message as string) || "一部のナレッジを保存できませんでした。");
        }
      }
      setSavedCount(saved);
      if (saved > 0) {
        setPhase("done");
      }
    } catch {
      setError("保存に失敗しました。通信環境をご確認ください。");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "idle" || phase === "hidden") return null;

  if (phase === "done") {
    return (
      <section className="glass-card p-5">
        <div className="text-base font-semibold text-primary">✅ {savedCount} 件のナレッジを学習させました</div>
        <p className="mt-1 text-xs text-muted">
          追加で学習させたい内容 (メニュー・料金方針・よくある質問など) は、店舗設定 &gt; LINEナレッジ
          からいつでも登録できます。自動返信を始めるには AI 自動入力設定で「受信メッセージに店舗ナレッジで自動返信」を
          ON にしてください。
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={saving || answeredCount === 0} onClick={handleSave}>
          {saving ? "学習中…" : `この内容で学習させる (${answeredCount}件)`}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={dismiss}>
          あとで (設定から登録する)
        </button>
        <span className="text-xs text-muted">あとからは 店舗設定 &gt; LINEナレッジ で登録できます。</span>
      </div>
    </section>
  );
}
