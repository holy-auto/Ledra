"use client";

/**
 * POS チェックアウト完了画面に表示する在庫引落推定パネル。
 *
 * 入力: cart / menu_items_json から拾った { menu_item_id, name, category, qty }
 * 出力: SKU 単位の引落量 (link / history / ai / fallback)
 *
 * 引落の実行は別エンドポイントが必要 (inventory_movements POST が未実装なので
 * 本パネルは「確認」までで完了)。将来 inventory_movements が立ち上がったら
 * 「引落を実行」ボタンを追加して 1 クリック反映できる構造。
 *
 * 在庫マスター (`inventory_skus`) が未作成の場合は API が warning を返すので
 * 静かに inline メッセージだけ出して非ブロッキング。
 */
import { useEffect, useState } from "react";

interface Sale {
  menu_item_id: string;
  menu_item_name: string;
  service_category?: string | null;
  sold_quantity: number;
}

interface Suggestion {
  menu_item_id: string;
  sku_id: string;
  sku_name: string;
  quantity: number;
  confidence: number;
  method: "link" | "history" | "ai" | "skipped" | "fallback";
  reason: string;
}

const METHOD_LABEL: Record<Suggestion["method"], string> = {
  link: "確定",
  history: "履歴推定",
  ai: "AI 推定",
  fallback: "暫定",
  skipped: "対象外",
};

export default function PosInventoryDeductPanel({ sales }: { sales: Sale[] }) {
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (sales.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/admin/inventory/ai-pos-deduct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sales }),
        });
        if (res.status === 403 || res.status === 429) {
          // 静かに失敗 (POS の主機能ではない)
          if (!cancelled) setErr(null);
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !j?.ok || j.ai_disabled) {
          setErr(null);
          return;
        }
        setWarning(j.warning ?? null);
        setSuggestions(j.suggestions ?? []);
      } catch {
        if (!cancelled) setErr(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sales]);

  if (sales.length === 0) return null;
  if (loading) {
    return (
      <div className="rounded-xl border border-border-default bg-surface px-3 py-2 text-xs text-muted">
        在庫引落を推定中…
      </div>
    );
  }
  if (err) return null;
  if (warning && (!suggestions || suggestions.length === 0)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        ⚠ {warning}
      </div>
    );
  }
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <section className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-accent">✨ 在庫引落候補</div>
        <div className="text-[10px] text-muted">{suggestions.length} 件</div>
      </div>

      <ul className="space-y-1 text-xs">
        {suggestions.map((s, i) => (
          <li
            key={`${s.menu_item_id}-${s.sku_id}-${i}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <div className="text-primary truncate">{s.sku_name}</div>
              <div className="text-[10px] text-muted truncate">
                {METHOD_LABEL[s.method]} · {s.reason}
              </div>
            </div>
            <span className="text-accent font-semibold shrink-0">{s.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="text-[10px] text-muted">※ 自動引落は次フェーズで実装予定 (現状は推定の確認のみ)</div>
    </section>
  );
}
