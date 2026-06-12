"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

// ─── 型定義 ──────────────────────────────────────────────────────
interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
}

interface Selection {
  qty: number;
}

const TAX_RATE = 0.1; // 消費税 10%

function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function QuickQuoteClient() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // 選択中メニュー: id -> { qty }
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [copied, setCopied] = useState(false);

  // ─── メニュー取得 ───
  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/menu-items?active_only=true");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const list = (Array.isArray(data.items) ? data.items : []) as Array<Record<string, unknown>>;
      setItems(
        list.map((it) => ({
          id: String(it.id),
          name: String(it.name ?? ""),
          description: it.description ? String(it.description) : null,
          unit_price: Number(it.unit_price ?? 0),
        })),
      );
    } catch (e) {
      console.error(e);
      setError("メニューの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // ─── 選択操作 ───
  function toggle(id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = { qty: 1 };
      }
      return next;
    });
  }

  function setQty(id: string, qty: number) {
    const q = Math.max(1, Math.min(999, Math.floor(qty) || 1));
    setSelected((prev) => (prev[id] ? { ...prev, [id]: { qty: q } } : prev));
  }

  function reset() {
    setSelected({});
    setCopied(false);
  }

  // ─── 金額計算 ───
  const { subtotal, tax, total, lineCount } = useMemo(() => {
    let sub = 0;
    let count = 0;
    for (const it of items) {
      const sel = selected[it.id];
      if (!sel) continue;
      sub += it.unit_price * sel.qty;
      count += 1;
    }
    const taxAmount = Math.round(sub * TAX_RATE);
    return { subtotal: sub, tax: taxAmount, total: sub + taxAmount, lineCount: count };
  }, [items, selected]);

  // ─── コピー ───
  async function copyTotal() {
    const text = `概算見積: ${yen(total)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード API が使えない環境向けフォールバック
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* 何もできない */
      }
      document.body.removeChild(ta);
    }
  }

  const visibleItems = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, filter]);

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">概算見積</h1>
        <p className="text-sm text-secondary mt-1">電話・来店時に素早く概算金額を出します（保存はされません）</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* ── 左: メニュー一覧 ── */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-sm font-semibold text-primary">メニューを選択</h2>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="メニュー名で絞り込み"
              className="text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="w-7 h-7 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-10 text-sm text-danger">{error}</div>
          ) : visibleItems.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted">
              {items.length === 0 ? "有効なメニューがありません" : "該当するメニューがありません"}
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {visibleItems.map((it) => {
                const sel = selected[it.id];
                const isChecked = Boolean(sel);
                return (
                  <div
                    key={it.id}
                    className={`flex items-center gap-3 py-2.5 px-1 rounded-lg transition-colors ${
                      isChecked ? "bg-accent-dim/40" : "hover:bg-surface-hover"
                    }`}
                  >
                    {/* チェックボックス */}
                    <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(it.id)}
                        className="w-4 h-4 accent-[var(--color-accent)] shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-primary truncate">{it.name}</span>
                        <span className="block text-xs text-muted">{yen(it.unit_price)}</span>
                      </span>
                    </label>

                    {/* 数量 */}
                    {isChecked && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setQty(it.id, (sel?.qty ?? 1) - 1)}
                          className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                          aria-label="数量を減らす"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={sel?.qty ?? 1}
                          onChange={(e) => setQty(it.id, Number(e.target.value))}
                          className="w-12 text-center text-sm border border-border-default rounded-md px-1 py-1 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(it.id, (sel?.qty ?? 1) + 1)}
                          className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                          aria-label="数量を増やす"
                        >
                          ＋
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 右: 合計サマリー ── */}
        <div className="lg:sticky lg:top-6 self-start">
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-sm font-semibold text-primary mb-4">概算金額</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-secondary">
                <span>小計</span>
                <span className="tabular-nums">{yen(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-secondary">
                <span>消費税（10%）</span>
                <span className="tabular-nums">{yen(tax)}</span>
              </div>
              <div className="border-t border-border-default pt-3 mt-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-primary">合計</span>
                  <span className="text-3xl font-bold text-accent tabular-nums">{yen(total)}</span>
                </div>
                <p className="text-xs text-muted mt-1 text-right">{lineCount} 品目</p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <button
                onClick={copyTotal}
                disabled={total <= 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    コピーしました
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                      />
                    </svg>
                    金額をコピー
                  </>
                )}
              </button>
              <button
                onClick={reset}
                disabled={lineCount === 0}
                className="w-full px-4 py-2.5 bg-inset text-secondary rounded-lg font-medium hover:bg-surface-active disabled:opacity-50 transition-colors"
              >
                リセット
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
