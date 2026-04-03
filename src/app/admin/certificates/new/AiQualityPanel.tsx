"use client";

/**
 * AI写真品質チェックパネル（B-3）
 * 証明書作成フォームに組み込む。写真URLとカテゴリを元に
 * Ledra Standard 基準での抜け漏れ・品質問題を検出する。
 */

import { useState } from "react";

interface PhotoIssue {
  type: string;
  message: string;
  suggestion: string;
}

interface MissingPhoto {
  id: string;
  label: string;
  required: boolean;
  count_min?: number;
  angle_hint?: string;
}

interface MissingField {
  key: string;
  label: string;
  required: boolean;
}

interface WarningMessage {
  level: "error" | "warning" | "info";
  message: string;
}

interface AuditResult {
  certificateId: string;
  category: string;
  overallStatus: "pass" | "warning" | "fail" | "pending";
  standardLevel: string;
  score: number;
  photoResults: Array<{
    photoUrl: string;
    expectedType?: string;
    status: "pass" | "warning" | "fail";
    issues: PhotoIssue[];
  }>;
  missingPhotos: MissingPhoto[];
  missingFields: MissingField[];
  warningMessages: WarningMessage[];
}

interface Props {
  category?: string;
  photoUrls?: string[];
  fieldValues?: Record<string, string>;
}

const STATUS_CONFIG = {
  pass: {
    label: "Ledra Standard ✅",
    bg: "bg-green-400/10",
    border: "border-green-400/40",
    text: "text-green-400",
    icon: "✅",
  },
  warning: {
    label: "要確認 ⚠️",
    bg: "bg-amber-400/10",
    border: "border-amber-400/40",
    text: "text-amber-400",
    icon: "⚠️",
  },
  fail: {
    label: "基準未達 ❌",
    bg: "bg-red-400/10",
    border: "border-red-400/40",
    text: "text-red-400",
    icon: "❌",
  },
  pending: {
    label: "未チェック",
    bg: "bg-surface",
    border: "border-border-default",
    text: "text-muted",
    icon: "○",
  },
};

export default function AiQualityPanel({ category, photoUrls = [], fieldValues = {} }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!category) {
      setError("施工カテゴリが選択されていません");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/certificates/ai-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, photo_urls: photoUrls, field_values: fieldValues }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "品質チェックに失敗しました");
      setResult(data.audit);
    } catch (e: any) {
      setError(e.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const status = result?.overallStatus ?? "pending";
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`rounded-xl border ${result ? cfg.border : "border-border-default"} ${result ? cfg.bg : "bg-surface"}`}
    >
      {/* ヘッダー */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:opacity-80 rounded-xl transition-opacity"
      >
        <span className="text-base">📋</span>
        <span className={result ? cfg.text : "text-secondary"}>
          撮影チェック / 抜け漏れ検知
          {result && (
            <span className="ml-2 font-semibold">
              {cfg.icon} {result.score}/100点
            </span>
          )}
        </span>
        <span className="ml-auto text-muted text-xs">{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle">
          <p className="text-xs text-muted mt-3">
            Ledra Standard基準に基づき、写真・記入内容の不足・品質問題を検出します。
          </p>

          {/* チェックボタン */}
          <button
            type="button"
            onClick={check}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
                チェック中…
              </>
            ) : (
              <>📋 品質チェックを実行</>
            )}
          </button>

          {/* エラー */}
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* チェック結果 */}
          {result && (
            <div className="space-y-3">
              {/* スコア表示 */}
              <div className={`rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                  <span className={`text-lg font-bold ${cfg.text}`}>
                    {result.score}
                    <span className="text-sm font-normal">/100</span>
                  </span>
                </div>
                {/* スコアバー */}
                <div className="h-2 bg-inset rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${status === "pass" ? "bg-green-400" : status === "warning" ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
              </div>

              {/* エラーメッセージ */}
              {result.warningMessages.filter((w) => w.level === "error").length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-400">❌ 必須修正</p>
                  {result.warningMessages
                    .filter((w) => w.level === "error")
                    .map((w, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-red-400/10 border border-red-400/30 px-3 py-2 text-xs text-red-400"
                      >
                        {w.message}
                      </div>
                    ))}
                </div>
              )}

              {/* 警告メッセージ */}
              {result.warningMessages.filter((w) => w.level === "warning").length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-400">⚠️ 推奨修正</p>
                  {result.warningMessages
                    .filter((w) => w.level === "warning")
                    .map((w, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-amber-400/10 border border-amber-400/30 px-3 py-2 text-xs text-amber-400"
                      >
                        {w.message}
                      </div>
                    ))}
                </div>
              )}

              {/* 不足写真 */}
              {result.missingPhotos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-secondary mb-2">
                    📷 不足写真（{result.missingPhotos.filter((p) => p.required).length}枚必須）
                  </p>
                  <div className="space-y-1.5">
                    {result.missingPhotos.map((p, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                          p.required
                            ? "bg-red-400/10 border border-red-400/30 text-red-400"
                            : "bg-amber-400/10 border border-amber-400/20 text-amber-400"
                        }`}
                      >
                        <span className="mt-0.5">{p.required ? "🔴" : "🟡"}</span>
                        <div>
                          <span className="font-medium">{p.label}</span>
                          {p.required && <span className="ml-1 opacity-70">（必須）</span>}
                          {p.angle_hint && <p className="text-muted mt-0.5">{p.angle_hint}</p>}
                          {p.count_min && p.count_min > 1 && <p className="mt-0.5">最低{p.count_min}枚</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 不足フィールド */}
              {result.missingFields.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-secondary mb-2">
                    📝 未入力項目（{result.missingFields.filter((f) => f.required).length}件必須）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missingFields.map((f, i) => (
                      <span
                        key={i}
                        className={`rounded-full px-2.5 py-0.5 text-xs border ${
                          f.required
                            ? "bg-red-400/10 border-red-400/30 text-red-400"
                            : "bg-amber-400/10 border-amber-400/20 text-amber-400"
                        }`}
                      >
                        {f.label}
                        {f.required ? " *" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 合格時メッセージ */}
              {status === "pass" && (
                <div className="rounded-lg bg-green-400/10 border border-green-400/30 px-3 py-2 text-xs text-green-400">
                  ✅ Ledra Standard 基準をクリアしています！このまま発行できます。
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
