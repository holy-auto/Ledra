"use client";

/**
 * Square 紐付けモーダル内に置く「AI 候補」ボタン。
 *
 * 押下時に POST /api/admin/square/orders/[id]/ai-link を叩き、自店顧客マスタ
 * から最有力候補を 1〜3 名返す。「この顧客にする」で親フォームに反映。
 */
import { useState } from "react";

interface Match {
  customer_id: string;
  name: string;
  score: number;
  reasons: string[];
}

interface Props {
  orderId: string;
  onPick: (customerId: string) => void;
}

export default function SquareAiLinkButton({ orderId, onPick }: Props) {
  const [loading, setLoading] = useState(false);
  const [best, setBest] = useState<Match | null>(null);
  const [alternatives, setAlternatives] = useState<Match[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/square/orders/${orderId}/ai-link`, {
        method: "POST",
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "Starter プラン以上で利用可");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール制限に達しました");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || j.ai_disabled) {
        setErr(j?.message ?? "候補が見つかりませんでした");
        return;
      }
      const m = j.match;
      if (!m || (!m.best && (!m.alternatives || m.alternatives.length === 0))) {
        setErr("候補が見つかりませんでした");
        return;
      }
      setBest(m.best ?? null);
      setAlternatives(m.alternatives ?? []);
      setMethod(m.method ?? null);
    } catch {
      setErr("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (!best && alternatives.length === 0 && !err) {
    return (
      <button type="button" onClick={run} disabled={loading} className="text-xs underline text-accent hover:opacity-80">
        {loading ? "候補を探しています..." : "✨ AI で候補を提案"}
      </button>
    );
  }

  if (err) {
    return (
      <div className="text-xs text-danger-text">
        {err}{" "}
        <button type="button" onClick={() => setErr(null)} className="underline">
          再試行
        </button>
      </div>
    );
  }

  const renderRow = (m: Match, label?: string) => (
    <li
      key={m.customer_id}
      className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2"
    >
      <div className="min-w-0">
        <div className="text-sm text-primary truncate">
          {m.name} <span className="text-[10px] text-muted ml-1">{Math.round(m.score * 100)}%</span>
        </div>
        <div className="text-[10px] text-muted truncate">
          {label ? `${label} · ` : ""}
          {m.reasons.join(" / ")}
        </div>
      </div>
      <button type="button" onClick={() => onPick(m.customer_id)} className="btn-ghost text-[11px] py-1 px-2 shrink-0">
        この顧客
      </button>
    </li>
  );

  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-accent font-semibold">
        <span>✨ AI 候補 ({method})</span>
        <button type="button" onClick={run} className="underline opacity-80">
          再評価
        </button>
      </div>
      <ul className="space-y-1.5 text-xs">
        {best && renderRow(best, "Best")}
        {alternatives.slice(0, 3).map((a) => renderRow(a))}
      </ul>
    </div>
  );
}
