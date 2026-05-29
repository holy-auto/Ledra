"use client";

/**
 * 任意のテキスト (お知らせ本文 / 製品説明 / 利用規約 等) を 5 言語に翻訳する
 * モーダルパネル。フォームのどこかに置いて、現在の値を `getText` で取得 →
 * 翻訳結果を表示 → コピーや「本文に置換」を選ばせる。
 *
 * 4 つの設置パターン:
 *   1) 本文の下に常設 (現在の値を翻訳)
 *   2) 必要時にドロワー
 *   3) 設定ページの「テスト」サンドボックス
 *   4) お知らせ複製時の事後ローカライズ
 *
 * `onReplace` を渡せば「本文を置換」ボタンが出る (置換しない用途は省略可)。
 */
import { useState } from "react";

type Lang = "en" | "zh" | "vi" | "ko" | "pt-BR";
type Tone = "formal" | "casual" | "marketing";

const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  zh: "中文 (簡体)",
  vi: "Tiếng Việt",
  ko: "한국어",
  "pt-BR": "Português (BR)",
};

interface Props {
  /** 翻訳元テキストをその場で計算するコールバック (textarea の current value 等) */
  getText: () => string;
  /** "announcement" | "product_description" | "general" — フィールドポリシーの参照に使う */
  kind?: "announcement" | "product_description" | "general";
  /** 渡すと「本文を置換」ボタンが出る。なければ表示 + コピーのみ */
  onReplace?: (translated: string) => void;
}

export default function TranslatePanel({ getText, kind = "general", onReplace }: Props) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [tone, setTone] = useState<Tone>("formal");
  const [loading, setLoading] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [ai, setAi] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    const text = getText().trim();
    if (!text) {
      setErr("翻訳元テキストが空です。");
      return;
    }
    setLoading(true);
    setErr(null);
    setTranslated(null);
    try {
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_lang: lang, tone, kind }),
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "Standard プラン以上で利用できます。");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール制限に達しました。");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || j.ai_disabled) {
        setErr(j?.message ?? "翻訳に失敗しました。");
        return;
      }
      setTranslated(j.translated ?? "");
      setConfidence(typeof j.confidence === "number" ? j.confidence : null);
      setAi(j.ai !== false);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!translated) return;
    try {
      await navigator.clipboard.writeText(translated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-accent/10 rounded-xl transition-colors"
      >
        <span>✨ 多言語翻訳</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-accent/20">
          <p className="text-xs text-muted mt-3">
            お知らせ・製品説明・利用規約を英 / 中 / ベトナム / 韓 / ポルトガル語に翻訳します。
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-muted">言語:</span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="rounded-lg border border-border-default bg-surface text-primary px-2 py-1 text-xs"
              >
                {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                  <option key={l} value={l}>
                    {LANG_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-muted">トーン:</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="rounded-lg border border-border-default bg-surface text-primary px-2 py-1 text-xs"
              >
                <option value="formal">formal</option>
                <option value="casual">casual</option>
                <option value="marketing">marketing</option>
              </select>
            </label>
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="rounded-xl border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {loading ? "翻訳中..." : "翻訳"}
            </button>
          </div>

          {err && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {err}
            </div>
          )}

          {translated != null && (
            <div className="rounded-lg border border-accent/20 bg-surface px-3 py-2 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>
                  訳文 ({LANG_LABEL[lang]})
                  {confidence != null && ` · 信頼度 ${Math.round(confidence * 100)}%`}
                  {!ai && " · キャッシュ / フォールバック"}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={copyResult} className="underline text-accent">
                    {copied ? "✓ コピー済" : "コピー"}
                  </button>
                  {onReplace && (
                    <button
                      type="button"
                      onClick={() => onReplace(translated)}
                      className="underline text-accent"
                    >
                      本文を置換
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-primary whitespace-pre-wrap">{translated}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
