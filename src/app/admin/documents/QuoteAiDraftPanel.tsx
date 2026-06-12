"use client";

/**
 * 見積書 (doc_type=estimate) のフォーム上に置く AI 起票パネル。
 *
 * 車両 ID + サービスカテゴリを選んで POST /api/admin/quotes/ai-from-vehicle を
 * 叩き、明細 / 合計 / 有効期限 / 条件文をフォームに流し込む。
 *
 * 親フォームには `onApply` で items / note を渡すだけ。
 * 車両一覧は API から取得 (既存の `/api/admin/vehicles` を流用)。
 */
import { useEffect, useState } from "react";

interface DraftItem {
  description: string;
  quantity: number;
  unit_price: number;
  rationale?: string;
}
interface QuoteDraft {
  items: DraftItem[];
  total: number;
  validity_days: number;
  terms: string;
  ai: boolean;
  confidence: number;
  /** 高精度モード時のみ: "low" | "medium" | "high" */
  confidenceLevel?: "low" | "medium" | "high";
  /** 高精度モード時のみ: 参照した過去実績パターン数 */
  patternsUsed?: number;
}

type PrecisionMode = "standard" | "enhanced";

const CONFIDENCE_BADGE: Record<"low" | "medium" | "high", { label: string; tone: string }> = {
  low: { label: "低", tone: "bg-zinc-200 text-zinc-600" },
  medium: { label: "中", tone: "bg-amber-100 text-amber-700" },
  high: { label: "高", tone: "bg-emerald-100 text-emerald-700" },
};

interface VehicleOption {
  id: string;
  display: string;
}

interface Props {
  customerId?: string;
  onApply: (items: DraftItem[], terms: string) => void;
}

export default function QuoteAiDraftPanel({ customerId, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [category, setCategory] = useState("コーティング");
  const [mode, setMode] = useState<PrecisionMode>("standard");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const q = customerId ? `?customer_id=${encodeURIComponent(customerId)}&limit=50` : "?limit=50";
        const res = await fetch(`/api/admin/vehicles${q}`);
        const j = await res.json().catch(() => ({}));
        const list = (j?.vehicles ?? []) as Array<{
          id: string;
          maker: string | null;
          model: string | null;
          plate_display?: string | null;
        }>;
        setVehicles(
          list.map((v) => ({
            id: v.id,
            display: [v.maker, v.model, v.plate_display].filter(Boolean).join(" ") || v.id.slice(0, 8),
          })),
        );
      } catch {
        setVehicles([]);
      }
    })();
  }, [open, customerId]);

  async function run() {
    if (!vehicleId) {
      setErr("車両を選んでください。");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      if (mode === "enhanced") {
        await runEnhanced();
      } else {
        await runStandard();
      }
    } catch {
      setErr("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function runStandard() {
    const res = await fetch("/api/admin/quotes/ai-from-vehicle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_id: vehicleId,
        customer_id: customerId,
        service_category: category,
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
    if (!res.ok || !j?.ok || j.ai_disabled || !j.draft) {
      setErr(j?.message ?? "起票に失敗しました");
      return;
    }
    setDraft({
      items: j.draft.items ?? [],
      total: j.draft.total ?? 0,
      validity_days: j.draft.validity_days ?? 30,
      terms: j.draft.terms ?? "",
      ai: j.draft.ai !== false,
      confidence: j.draft.confidence ?? 0,
    });
  }

  async function runEnhanced() {
    const requested = category
      .split(/[、,／/\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/admin/ai/enhanced-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_id: vehicleId,
        customer_id: customerId,
        service_category: category,
        requested_services: requested.length > 0 ? requested : [category],
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
      setErr(j?.message ?? "起票に失敗しました");
      return;
    }
    setDraft({
      items: j.quote_lines ?? [],
      total: j.estimated_total ?? 0,
      validity_days: j.validity_days ?? 30,
      terms: j.terms ?? "",
      ai: j.ai !== false,
      confidence: 0,
      confidenceLevel: (j.confidence ?? "low") as "low" | "medium" | "high",
      patternsUsed: j.patterns_used ?? 0,
    });
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-accent/10 rounded-xl"
      >
        <span>✨ AI で見積書を起票</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-accent/20">
          <p className="text-xs text-muted mt-3">過去類似請求書 + 車両サイズ係数で明細・合計・条件文を生成します。</p>

          <div className="space-y-1">
            <div className="text-xs text-muted">AI精度モード</div>
            <div className="inline-flex rounded-lg border border-accent/30 p-0.5">
              <button
                type="button"
                onClick={() => setMode("standard")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === "standard" ? "bg-accent text-white" : "text-accent hover:bg-accent/10"
                }`}
              >
                標準
              </button>
              <button
                type="button"
                onClick={() => setMode("enhanced")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === "enhanced" ? "bg-accent text-white" : "text-accent hover:bg-accent/10"
                }`}
              >
                高精度（過去実績参照）
              </button>
            </div>
            {mode === "enhanced" && (
              <p className="text-[10px] text-muted">
                成約済み請求書の実勢価格を AI
                に与えて、より精度の高い価格を提案します。カテゴリ欄に複数サービスを「、」区切りで入力できます。
              </p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs text-muted">車両</div>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="select-field text-sm">
                <option value="">選択してください</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs text-muted">カテゴリ</div>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: コーティング / 板金 / PPF"
                className="input-field text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={run}
            disabled={loading || !vehicleId}
            className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {loading ? "起票中..." : "✨ 見積を起票"}
          </button>

          {err && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {err}
            </div>
          )}

          {draft && (
            <div className="rounded-lg border border-accent/20 bg-surface px-3 py-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>
                  合計 ¥{draft.total.toLocaleString("ja-JP")} · 有効 {draft.validity_days} 日
                  {draft.confidenceLevel ? "" : ` · 信頼度 ${Math.round(draft.confidence * 100)}%`}
                </span>
                {draft.confidenceLevel && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CONFIDENCE_BADGE[draft.confidenceLevel].tone}`}
                  >
                    信頼度 {CONFIDENCE_BADGE[draft.confidenceLevel].label}
                  </span>
                )}
                {draft.patternsUsed !== undefined && (
                  <span className="text-[10px] text-accent">{draft.patternsUsed}件の過去実績を参照</span>
                )}
              </div>
              <ul className="text-xs text-secondary space-y-1">
                {draft.items.map((it, i) => (
                  <li key={i}>
                    <span className="text-primary">{it.description}</span> ¥{it.unit_price.toLocaleString("ja-JP")} ×{" "}
                    {it.quantity}
                    {it.rationale && <div className="text-[10px] opacity-70 ml-3">{it.rationale}</div>}
                  </li>
                ))}
              </ul>
              {draft.terms && <p className="text-[11px] text-muted">{draft.terms}</p>}
              <button
                type="button"
                onClick={() => {
                  onApply(draft.items, draft.terms);
                  setOpen(false);
                }}
                className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
              >
                フォームに反映
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
