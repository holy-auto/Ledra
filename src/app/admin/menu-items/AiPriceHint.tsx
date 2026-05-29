"use client";

/**
 * メニュー編集行の単価入力欄に並べる「AI 推奨価格」ヒント。
 *
 * 押下時に POST /api/admin/menu-items/[id]/ai-price を叩き、
 * 推奨値 / バンド (min, p50, max) / 理由を 1 行のインラインバナーに表示。
 * 「採用する」リンクで親フォームの price フィールドに流し込む。
 */
import { useState } from "react";

interface Recommendation {
  recommended_price: number;
  band: { min: number; p50: number; max: number };
  confidence: number;
  rationale: string;
  ai: boolean;
}

interface Props {
  menuItemId: string;
  onApply: (price: number) => void;
}

export default function AiPriceHint({ menuItemId, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/menu-items/${menuItemId}/ai-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "Standard プラン以上で利用可");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール制限に達しました");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || j.ai_disabled || !j.recommendation) {
        setErr(j?.message ?? "推奨価格を計算できませんでした");
        return;
      }
      setRec(j.recommendation);
    } catch {
      setErr("通信エラー");
    } finally {
      setLoading(false);
    }
  }

  if (!rec && !err) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="text-[10px] underline text-muted hover:text-accent"
        title="自店過去販売 + 業界中央値 + 車両サイズで推奨価格を算出"
      >
        {loading ? "..." : "✨ AI 推奨"}
      </button>
    );
  }

  if (err) {
    return (
      <span className="text-[10px] text-danger-text">
        {err}{" "}
        <button type="button" onClick={() => setErr(null)} className="underline">
          再試行
        </button>
      </span>
    );
  }

  if (!rec) return null;

  return (
    <div className="text-[10px] text-muted space-y-0.5">
      <div>
        <span className="text-accent font-semibold">
          ¥{rec.recommended_price.toLocaleString("ja-JP")}
        </span>{" "}
        ({Math.round(rec.confidence * 100)}%){" "}
        <button
          type="button"
          onClick={() => onApply(rec.recommended_price)}
          className="underline text-accent ml-1"
        >
          採用
        </button>
      </div>
      <div className="opacity-70">
        範囲 ¥{rec.band.min.toLocaleString("ja-JP")} 〜 ¥{rec.band.max.toLocaleString("ja-JP")}
      </div>
      {rec.rationale && <div className="opacity-70">{rec.rationale}</div>}
    </div>
  );
}
