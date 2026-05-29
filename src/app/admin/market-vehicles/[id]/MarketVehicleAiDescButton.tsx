"use client";

/**
 * マーケット車両の説明文 + 特徴タグを AI 生成して、エディタの
 * description / features に流し込むボタン。
 *
 * 出品者向けメモ (任意) を入れられる小さなプロンプト欄付き。
 * 写真 URL を渡せば Vision モデルでの生成、無ければ text-only Haiku に降格。
 */
import { useState } from "react";

interface Props {
  vehicleId: string;
  photoUrls: string[];
  onApply: (description: string, features: string[]) => void;
}

export default function MarketVehicleAiDescButton({ vehicleId, photoUrls, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [sellerNotes, setSellerNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    description: string;
    features: string[];
    confidence: number;
    ai: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/market-vehicles/${vehicleId}/ai-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_notes: sellerNotes || undefined,
          photo_urls: photoUrls.slice(0, 3),
        }),
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
      if (!res.ok || !j?.ok || j.ai_disabled) {
        setErr(j?.message ?? "生成に失敗しました");
        return;
      }
      setResult({
        description: j.description ?? "",
        features: j.features ?? [],
        confidence: j.confidence ?? 0,
        ai: j.ai !== false,
      });
    } catch {
      setErr("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-accent/10 rounded-xl"
      >
        <span>✨ AI 説明文を生成</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-accent/20">
          <p className="text-xs text-muted mt-3">
            車両仕様 + 写真 ({photoUrls.length} 枚) から物件説明文と特徴タグを生成します。
          </p>

          <textarea
            value={sellerNotes}
            onChange={(e) => setSellerNotes(e.target.value)}
            rows={2}
            placeholder="出品者メモ (強調したい点を入れると説明文に反映されます。任意)"
            className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />

          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {loading ? "生成中..." : "✨ 説明文を生成"}
          </button>

          {err && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {err}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-accent/20 bg-surface px-3 py-2 space-y-2">
              <div className="text-[11px] text-muted">
                信頼度 {Math.round(result.confidence * 100)}%
                {!result.ai && " · text-only"}
              </div>
              <p className="text-sm text-primary whitespace-pre-wrap">{result.description}</p>
              {result.features.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.features.map((f, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-accent/10 text-accent text-[10px] px-2 py-0.5"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onApply(result.description, result.features);
                  setOpen(false);
                }}
                className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
              >
                エディタに流し込む
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
