"use client";

/**
 * AI下書き生成パネル（B-1）
 * 証明書作成フォームに組み込む。車両・ヒアリング情報からClaude がドラフトを生成し、
 * フォームフィールドに自動入力する。
 */

import { useState } from "react";

interface DraftMaterial {
  name: string;
  maker?: string;
  spec?: string;
  note?: string;
}

interface DraftResult {
  title: string;
  description: string;
  materials: DraftMaterial[];
  warrantyCandidates: string[];
  workAreas: string[];
  cautions: string;
  confidence: number;
  missingInfo: string[];
}

interface Props {
  vehicleId?: string;
  hearingId?: string;
  templateCategory?: string;
  onApply: (draft: DraftResult) => void;
}

export default function AiDraftPanel({ vehicleId, hearingId, templateCategory, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceMeta, setSourceMeta] = useState<{ similar_certs_used: number; hearing_used: boolean } | null>(null);

  const generate = async () => {
    if (!vehicleId && !hearingId) {
      setError("車両またはヒアリング情報を選択してください");
      return;
    }
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/admin/certificates/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, hearing_id: hearingId, template_category: templateCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "AI下書き生成に失敗しました");
      setDraft(data.draft);
      setSourceMeta(data.source_data);
    } catch (e: any) {
      setError(e.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = draft
    ? draft.confidence >= 0.8
      ? "text-green-600"
      : draft.confidence >= 0.5
        ? "text-amber-600"
        : "text-red-500"
    : "";

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5">
      {/* ヘッダー */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-accent/10 rounded-xl transition-colors"
      >
        <span className="text-base">✨</span>
        <span>AI下書き生成（β）</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-accent/20">
          <p className="text-xs text-muted mt-3">
            車両情報・ヒアリング・過去施工履歴を基に施工内容の下書きを自動生成します。
          </p>

          {/* 生成ボタン */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                生成中…
              </>
            ) : (
              <>✨ 下書きを生成</>
            )}
          </button>

          {/* エラー */}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          )}

          {/* 生成結果 */}
          {draft && (
            <div className="space-y-3">
              {/* メタ情報 */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`font-medium ${confidenceColor}`}>信頼度: {Math.round(draft.confidence * 100)}%</span>
                {sourceMeta && (
                  <>
                    <span className="text-muted">|</span>
                    <span className="text-muted">参照事例: {sourceMeta.similar_certs_used}件</span>
                    {sourceMeta.hearing_used && <span className="text-accent">✓ ヒアリングデータ使用</span>}
                  </>
                )}
              </div>

              {/* 不足情報警告 */}
              {draft.missingInfo.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-medium text-amber-700 mb-1">⚠ 不足情報</p>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {draft.missingInfo.map((m, i) => (
                      <li key={i}>• {m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* タイトル */}
              <div>
                <p className="text-xs font-medium text-muted mb-1">施工タイトル</p>
                <p className="text-sm font-semibold text-primary bg-surface rounded-lg px-3 py-2">{draft.title}</p>
              </div>

              {/* 施工内容 */}
              <div>
                <p className="text-xs font-medium text-muted mb-1">施工内容</p>
                <p className="text-xs text-primary bg-surface rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                  {draft.description}
                </p>
              </div>

              {/* 施工箇所 */}
              {draft.workAreas.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted mb-1">施工箇所</p>
                  <div className="flex flex-wrap gap-1">
                    {draft.workAreas.map((a, i) => (
                      <span key={i} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 使用材料 */}
              {draft.materials.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted mb-1">使用材料</p>
                  <div className="space-y-1">
                    {draft.materials.map((m, i) => (
                      <div key={i} className="text-xs text-primary">
                        <span className="font-medium">{m.name}</span>
                        {m.maker && <span className="text-muted ml-1">/ {m.maker}</span>}
                        {m.spec && <span className="text-muted ml-1">({m.spec})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 保証期間候補 */}
              {draft.warrantyCandidates.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted mb-1">保証期間候補</p>
                  <div className="flex gap-2">
                    {draft.warrantyCandidates.map((w, i) => (
                      <span
                        key={i}
                        className="rounded-lg border border-border-default bg-surface px-2.5 py-1 text-xs text-secondary"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 適用ボタン */}
              <button
                type="button"
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
                className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
              >
                フォームに適用する
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
