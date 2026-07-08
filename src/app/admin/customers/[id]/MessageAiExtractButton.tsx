"use client";

/**
 * inbound メッセージ 1 件を AI で予約候補に抽出するボタン。
 *
 * 押下時に POST /api/admin/customer-messages/[id]/ai-extract を叩き、結果を
 * 同じ吹き出しに展開表示する。結果は `customer_messages.ai_extracted` に保存
 * されるが、UI 表示はメモリ内 (リロード後は再抽出が必要)。
 *
 * 「予約候補にする」ボタンで /admin/jobs/new に reservation hint を引き継ぐ。
 */
import { useState } from "react";
import { ExtractedCandidateCard, type ExtractedResult } from "@/components/messages/ExtractedCandidateCard";

export type { ExtractedResult };
export { ExtractedCandidateCard };

interface Props {
  messageId: string;
  customerId?: string;
}

export default function MessageAiExtractButton({ messageId, customerId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/customer-messages/${messageId}/ai-extract`, {
        method: "POST",
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "Standard プラン以上で利用できます。");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール上限に達しました。");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || j.ai_disabled) {
        setErr(j?.message ?? "抽出に失敗しました。");
        return;
      }
      setResult(j.extracted ?? null);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  if (!result && !err) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="mt-1.5 text-[10px] underline text-muted hover:text-accent"
      >
        {loading ? "解析中..." : "✨ AI で予約候補に抽出"}
      </button>
    );
  }

  if (err) {
    return (
      <div className="mt-1.5 text-[10px] text-danger-text">
        {err}{" "}
        <button type="button" onClick={() => setErr(null)} className="underline">
          再試行
        </button>
      </div>
    );
  }

  if (!result) return null;

  return <ExtractedCandidateCard result={result} customerId={customerId} />;
}
