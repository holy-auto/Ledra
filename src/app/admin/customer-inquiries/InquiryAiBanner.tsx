"use client";

/**
 * 問い合わせ 1 件に対する AI 分類バナー。
 *
 * 展開された問い合わせの本文の下、返信フォームの上に表示。
 * 「AI で分類する」ボタンを押すまでは API を叩かない (テナント単位の月間
 * AI コストを抑えるため、自動実行はしない方針)。
 *
 * 戻り値:
 *   - category / priority / draft_reply / reason / confidence
 *   - draft_reply は「返信下書きを使う」ボタンで親 (textarea) に流し込み
 *
 * プラン不足 / 設定 OFF / エラーは静かに失敗 (ボタンを再活性 + 1 行メッセージ)。
 */
import { useState } from "react";

interface Classification {
  category: string | null;
  priority: string | null;
  draft_reply: string;
  reason: string;
  confidence: number;
  ai: boolean;
  policies: Record<string, "auto" | "suggest" | "manual">;
}

const CATEGORY_LABEL: Record<string, string> = {
  technical: "技術",
  billing: "請求",
  reservation: "予約",
  warranty: "保証",
  complaint: "苦情",
  praise: "称賛",
  quote_request: "見積依頼",
  other: "その他",
};

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  med: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-800",
};

interface Props {
  inquiryId: string;
  onUseDraft: (draft: string) => void;
}

export default function InquiryAiBanner({ inquiryId, onUseDraft }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Classification | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/customer-inquiries/${inquiryId}/ai-classify`, {
        method: "POST",
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "AI 分類は Standard プラン以上でご利用いただけます。");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール数の制限に達しました。しばらくお待ちください。");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErr(json?.message ?? "AI 分類に失敗しました。");
        return;
      }
      if (json.ai_disabled) {
        setErr("テナント設定で AI 自動入力が OFF になっています。");
        return;
      }
      setResult(json.classification);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  if (!result && !err) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 flex items-center justify-between gap-2">
        <div className="text-xs text-accent">
          ✨ AI で分類 + 返信下書きを生成できます。
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="btn-ghost text-[11px] py-1 px-2"
        >
          {loading ? "解析中..." : "AI 分類"}
        </button>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-border-default bg-surface px-3 py-2 text-xs text-muted flex items-center justify-between gap-2">
        <span>{err}</span>
        <button type="button" onClick={() => setErr(null)} className="btn-ghost text-[11px] py-0.5 px-1.5">
          再試行
        </button>
      </div>
    );
  }

  if (!result) return null;

  const category = result.category ?? "other";
  const priority = result.priority ?? "med";

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-accent font-semibold">✨ AI 分類</span>
        {result.category && (
          <span className="rounded-full bg-accent/10 text-accent px-2 py-0.5">
            {CATEGORY_LABEL[category] ?? category}
          </span>
        )}
        {result.priority && (
          <span className={`rounded-full px-2 py-0.5 ${PRIORITY_TONE[priority] ?? PRIORITY_TONE.med}`}>
            {priority === "high" ? "高優先" : priority === "low" ? "低優先" : "中優先"}
          </span>
        )}
        <span className="text-muted">信頼度 {Math.round(result.confidence * 100)}%</span>
        {!result.ai && <span className="text-muted">(ルールベース)</span>}
      </div>
      {result.reason && (
        <div className="text-[11px] text-muted">{result.reason}</div>
      )}
      {result.draft_reply && (
        <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2">
          <div className="text-[11px] text-muted mb-1">返信下書き</div>
          <p className="text-sm text-primary whitespace-pre-wrap leading-relaxed">{result.draft_reply}</p>
          <button
            type="button"
            onClick={() => onUseDraft(result.draft_reply)}
            className="mt-2 btn-ghost text-[11px] py-1 px-2"
          >
            この下書きを使う
          </button>
        </div>
      )}
    </div>
  );
}
