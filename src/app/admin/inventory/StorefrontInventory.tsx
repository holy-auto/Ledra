"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useMemo, useState } from "react";
import useSWR from "swr";
import BigActionButton from "@/components/pos/BigActionButton";
import POSSection from "@/components/pos/POSSection";
import { fetcher } from "@/lib/swr";
import { formatJpy } from "@/lib/format";

/**
 * StorefrontInventory
 * ------------------------------------------------------------
 * 店頭モードの在庫管理。
 *
 *  ① サマリ (登録数 / 在庫不足 / 在庫評価額)
 *  ② 巨大ボタン: 入庫 / 出庫 / 棚卸 (品目選択モーダル → 数量入力)
 *  ③ 在庫不足アラート (大きめカード、1 タップで入庫記録)
 *  ④ 全在庫リスト (検索可)
 */

type InventoryItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Stats = { total: number; low_stock_count: number; total_value: number };
type ApiResponse = { items: InventoryItem[]; stats: Stats };

type MoveType = "in" | "out" | "adjust";

const MOVE_LABEL: Record<MoveType, string> = {
  in: "入庫",
  out: "出庫",
  adjust: "棚卸調整",
};

export default function StorefrontInventory() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const swrKey = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("active_only", "true");
    if (activeSearch) sp.set("q", activeSearch);
    return `/api/admin/inventory/items?${sp.toString()}`;
  }, [activeSearch]);

  const { data, isLoading, mutate } = useSWR<ApiResponse>(swrKey, fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const stats = data?.stats;

  const lowStock = useMemo(
    () => items.filter((i) => Number(i.current_stock) <= Number(i.min_stock) && Number(i.min_stock) > 0),
    [items],
  );

  /* ---------- Modal state ---------- */
  const [action, setAction] = useState<MoveType | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const openAction = (type: MoveType) => {
    setAction(type);
    setSelectedItem(null);
    setQuantity("");
    setReason("");
    setErr(null);
  };

  const startMove = (type: MoveType, item: InventoryItem) => {
    setAction(type);
    setSelectedItem(item);
    setQuantity("");
    setReason("");
    setErr(null);
  };

  const close = () => {
    setAction(null);
    setSelectedItem(null);
    setQuantity("");
    setReason("");
    setErr(null);
  };

  const submit = async () => {
    if (!action || !selectedItem) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      setErr("数量を入力してください");
      return;
    }

    const act = action;
    const item = selectedItem;
    const snapshot = data;

    const prev = Number(item.current_stock);
    const newStock = act === "in" ? prev + qty : act === "out" ? prev - qty : qty;

    // 楽観的更新：モーダルは即閉じ、在庫数はすぐに反映
    setToast({ text: `${item.name}：${MOVE_LABEL[act]}を記録しました`, ok: true });
    window.setTimeout(() => setToast(null), 3000);
    close();

    if (snapshot) {
      const nextItems = snapshot.items.map((i) => (i.id === item.id ? { ...i, current_stock: newStock } : i));
      const nextLow = nextItems.filter(
        (i) => Number(i.current_stock) <= Number(i.min_stock) && Number(i.min_stock) > 0,
      ).length;
      const nextValue = nextItems.reduce((s, i) => s + (i.unit_cost ?? 0) * Number(i.current_stock), 0);
      mutate(
        { items: nextItems, stats: { ...snapshot.stats, low_stock_count: nextLow, total_value: nextValue } },
        { revalidate: false },
      );
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/inventory/movements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          type: act,
          quantity: qty,
          reason: reason.trim() || null,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      // サーバ応答と差異があった時のために背後で再検証
      mutate();
    } catch (e: unknown) {
      if (snapshot) mutate(snapshot, { revalidate: false });
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ text: `記録に失敗しました: ${msg}`, ok: false });
      window.setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── ① サマリ ─── */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">登録数</div>
            <div className="mt-1 text-2xl font-bold text-primary">{stats?.total ?? "—"}</div>
            <div className="mt-0.5 text-[11px] text-muted">在庫アイテム</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">在庫不足</div>
            <div
              className={`mt-1 text-2xl font-bold ${
                (stats?.low_stock_count ?? 0) > 0 ? "text-warning" : "text-primary"
              }`}
            >
              {stats?.low_stock_count ?? "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">要補充</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">在庫評価額</div>
            <div className="mt-1 text-2xl font-bold text-primary">{stats ? formatJpy(stats.total_value) : "—"}</div>
            <div className="mt-0.5 text-[11px] text-muted">(単価×在庫)</div>
          </div>
        </div>
      </section>

      {/* ─── ② 大型ボタン ─── */}
      <POSSection title="在庫の入出庫" description="操作を選ぶとお品選択画面に進みます">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BigActionButton
            tone="success"
            title="入庫を記録"
            subtitle="仕入れ・補充時に"
            onClick={() => openAction("in")}
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            }
          />
          <BigActionButton
            tone="warning"
            title="出庫を記録"
            subtitle="施工使用・廃棄など"
            onClick={() => openAction("out")}
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            }
          />
          <BigActionButton
            tone="neutral"
            title="棚卸で調整"
            subtitle="実在庫に合わせて上書き"
            onClick={() => openAction("adjust")}
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3"
                />
              </svg>
            }
          />
        </div>
      </POSSection>

      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.ok
              ? "border-success/30 bg-success-dim text-success-text"
              : "border-danger/30 bg-danger-dim text-danger-text"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* ─── ③ 在庫不足アラート ─── */}
      {lowStock.length > 0 && (
        <POSSection title="在庫不足の品目" description="タップで入庫を記録できます" compact>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {lowStock.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning-dim p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-warning-text">{item.name}</div>
                  <div className="text-[11px] text-warning-text/80">
                    現在 {Number(item.current_stock)} {item.unit} / 最低 {Number(item.min_stock)} {item.unit}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startMove("in", item)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  入庫
                </button>
              </li>
            ))}
          </ul>
        </POSSection>
      )}

      {/* ─── ④ 全在庫リスト ─── */}
      <POSSection
        title={activeSearch ? `検索結果 (${items.length}件)` : "在庫一覧"}
        description="品目をタップすると入庫/出庫を記録できます"
        action={
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setActiveSearch(search.trim());
            }}
          >
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="品目・SKU"
              className="rounded-full border border-border-subtle bg-inset px-3 py-1.5 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              検索
            </button>
            {activeSearch && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveSearch("");
                }}
                className="text-[11px] text-muted hover:text-primary"
              >
                クリア
              </button>
            )}
          </form>
        }
        compact
      >
        {isLoading && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-surface/40 p-6 text-center text-sm text-muted">
            読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-surface/40 p-6 text-center text-sm text-muted">
            {activeSearch ? "該当する在庫はありません" : "まだ在庫アイテムが登録されていません"}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const isLow = Number(item.current_stock) <= Number(item.min_stock) && Number(item.min_stock) > 0;
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-primary">{item.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {item.sku && <span className="font-mono">{item.sku}</span>}
                        {item.sku && item.category && " · "}
                        {item.category}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isLow ? "text-warning-text" : "text-primary"}`}>
                        {Number(item.current_stock)}
                        <span className="ml-1 text-xs text-muted">{item.unit}</span>
                      </div>
                      {isLow && (
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-warning-text">不足</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startMove("in", item)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-success-dim px-2 py-2 text-xs font-semibold text-success-text hover:brightness-105"
                    >
                      + 入庫
                    </button>
                    <button
                      type="button"
                      onClick={() => startMove("out", item)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-warning-dim px-2 py-2 text-xs font-semibold text-warning-text hover:brightness-105"
                    >
                      − 出庫
                    </button>
                    <button
                      type="button"
                      onClick={() => startMove("adjust", item)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-inset px-2 py-2 text-xs font-semibold text-secondary hover:bg-surface-hover"
                    >
                      棚卸
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </POSSection>

      {/* ─── Modal ─── */}
      {action && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border-subtle bg-surface p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {MOVE_LABEL[action]}
                </div>
                <div className="mt-1 text-lg font-bold text-primary">
                  {selectedItem ? selectedItem.name : "品目を選択"}
                </div>
                {selectedItem && (
                  <div className="text-xs text-muted">
                    現在庫 {Number(selectedItem.current_stock)} {selectedItem.unit}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                className="text-sm text-muted hover:text-primary"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {!selectedItem ? (
              <div className="max-h-[50vh] overflow-y-auto">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted">登録された在庫がありません</div>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(item);
                            setQuantity("");
                          }}
                          className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-surface-hover"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-primary">{item.name}</div>
                            {(item.sku || item.category) && (
                              <div className="text-[11px] text-muted">
                                {item.sku && <span className="font-mono">{item.sku}</span>}
                                {item.sku && item.category && " · "}
                                {item.category}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-xs text-secondary">
                            {Number(item.current_stock)} {item.unit}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted">
                    {action === "adjust" ? `調整後の在庫数（${selectedItem.unit}）` : `数量（${selectedItem.unit}）`}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-border-subtle bg-inset px-3 py-3 text-lg font-bold text-primary focus:border-accent focus:outline-none"
                    min="0"
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">理由 / メモ</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border-subtle bg-inset px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={action === "in" ? "仕入れ / 返品" : action === "out" ? "施工使用 / 廃棄" : "棚卸結果"}
                  />
                </div>

                {err && (
                  <div className="rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">
                    {err}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="flex-1 rounded-xl border border-border-subtle bg-inset px-3 py-3 text-sm font-semibold text-secondary hover:bg-surface-hover"
                  >
                    別の品目
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving || !quantity}
                    className="flex-[2] rounded-xl bg-accent px-3 py-3 text-base font-bold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "記録中..." : `${MOVE_LABEL[action]}を記録`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
