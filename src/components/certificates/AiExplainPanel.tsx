"use client";

/**
 * AI説明変換パネル（B-2）
 * 証明書詳細ページに組み込む。
 * 顧客・保険会社・社内・営業向けに説明文を自動生成する。
 */

import { useState } from "react";

interface ExplanationResult {
  audience: string;
  subject: string;
  headline: string;
  body: string;
  keyPoints: string[];
  callToAction?: string;
  warningFlags?: string[];
  internalMemo?: string;
  shareableUrl?: string;
}

interface Props {
  certificateId: string;
}

const AUDIENCE_OPTIONS = [
  { value: "customer", label: "顧客向け", icon: "👤", desc: "親しみやすく、安心感を重視した説明" },
  { value: "insurer", label: "保険会社向け", icon: "🏢", desc: "正確・フォーマルな技術記録" },
  { value: "internal", label: "社内向け", icon: "🔧", desc: "実務的・簡潔な作業記録" },
  { value: "sales", label: "営業提案向け", icon: "📊", desc: "他車への価値訴求" },
];

export default function AiExplainPanel({ certificateId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audience, setAudience] = useState("customer");
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/certificates/ai-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificate_id: certificateId, audience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "説明生成に失敗しました");
      setResult(data.explanation);
    } catch (e: any) {
      setError(e.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    const text = `【${result.subject}】\n${result.headline}\n\n${result.body}\n\n${result.keyPoints.map((p) => `• ${p}`).join("\n")}${result.callToAction ? `\n\n${result.callToAction}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const selectedAudience = AUDIENCE_OPTIONS.find((a) => a.value === audience);

  return (
    <div className="rounded-xl border border-purple-300/40 bg-purple-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-purple-700 hover:bg-purple-500/10 rounded-xl transition-colors"
      >
        <span className="text-base">📝</span>
        <span>AI説明変換（受け手別）</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-purple-300/20">
          <p className="text-xs text-muted mt-3">
            同じ証明書を受け手に合わせた表現に自動変換します。LINE・メールにそのまま貼り付けられます。
          </p>

          {/* 受け手選択 */}
          <div className="grid grid-cols-2 gap-2">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAudience(opt.value);
                  setResult(null);
                }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
                  audience === opt.value
                    ? "border-purple-400/60 bg-purple-400/15 text-purple-300"
                    : "border-border-default bg-surface text-secondary hover:bg-surface-hover"
                }`}
              >
                <span className="text-base">{opt.icon}</span>
                <div>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-muted text-[10px]">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* 生成ボタン */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-purple-400/50 bg-purple-400/15 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-400/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                生成中…
              </>
            ) : (
              <>
                {selectedAudience?.icon} {selectedAudience?.label}向けに変換
              </>
            )}
          </button>

          {/* エラー */}
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* 生成結果 */}
          {result && (
            <div className="space-y-3">
              {/* 件名 */}
              <div className="rounded-lg bg-purple-400/10 border border-purple-400/30 px-3 py-2">
                <p className="text-xs text-muted mb-0.5">件名</p>
                <p className="text-sm font-medium text-purple-300">{result.subject}</p>
              </div>

              {/* 見出し */}
              <div>
                <p className="text-xs text-muted mb-1">ヘッドライン</p>
                <p className="text-sm font-semibold text-primary">{result.headline}</p>
              </div>

              {/* 本文 */}
              <div>
                <p className="text-xs text-muted mb-1">本文</p>
                <div className="rounded-lg border border-border-default bg-surface px-3 py-3 text-xs text-primary whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {result.body}
                </div>
              </div>

              {/* キーポイント */}
              {result.keyPoints.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-1">要点</p>
                  <ul className="space-y-1">
                    {result.keyPoints.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-primary">
                        <span className="text-purple-500 mt-0.5">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* CTA */}
              {result.callToAction && (
                <div className="rounded-lg bg-purple-400/10 border border-purple-400/30 px-3 py-2 text-xs text-purple-300">
                  📣 {result.callToAction}
                </div>
              )}

              {/* 警告フラグ */}
              {result.warningFlags && result.warningFlags.length > 0 && (
                <div className="rounded-lg bg-amber-400/10 border border-amber-400/30 px-3 py-2">
                  <p className="text-xs font-medium text-amber-400 mb-1">⚠️ 注意フラグ</p>
                  <ul className="space-y-0.5">
                    {result.warningFlags.map((f, i) => (
                      <li key={i} className="text-xs text-amber-400/80">
                        • {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 内部メモ（社内向けのみ） */}
              {result.internalMemo && (
                <div className="rounded-lg bg-inset border border-border-subtle px-3 py-2">
                  <p className="text-xs font-medium text-secondary mb-1">📋 内部メモ</p>
                  <p className="text-xs text-muted">{result.internalMemo}</p>
                </div>
              )}

              {/* アクション */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="flex-1 rounded-xl border border-border-default bg-surface px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-hover transition-colors"
                >
                  {copied ? "✅ コピーしました" : "📋 テキストをコピー"}
                </button>
                {result.shareableUrl && (
                  <a
                    href={result.shareableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-accent bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                  >
                    🔗 証明書URL
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
