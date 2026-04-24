"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useMemo, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { fetcher } from "@/lib/swr";
import { formatJpy, formatDate } from "@/lib/format";

/* ---------- Types ---------- */

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

type InventoryStats = {
  total: number;
  low_stock_count: number;
  total_value: number;
};

type ItemsResponse = {
  items: InventoryItem[];
  stats: InventoryStats;
};

type Movement = {
  id: string;
  item_id: string;
  type: "in" | "out" | "adjust";
  quantity: number;
  reason: string | null;
  reservation_id: string | null;
  created_at: string;
  inventory_items?: { name: string; unit: string } | null;
};

type MovementsResponse = { movements: Movement[] };

/* ---------- Component ---------- */

export default function InventoryClient() {
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const swrKey = useMemo(() => {
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    if (lowStockOnly) sp.set("low_stock", "true");
    sp.set("active_only", showInactive ? "false" : "true");
    return `/api/admin/inventory/items?${sp.toString()}`;
  }, [search, lowStockOnly, showInactive]);

  const {
    data,
    error: swrError,
    isLoading,
    mutate,
  } = useSWR<ItemsResponse>(swrKey, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const { data: movementsData, mutate: mutateHistory } = useSWR<MovementsResponse>(
    showHistory ? "/api/admin/inventory/movements" : null,
    fetcher,
  );

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  /* ---------- Create form ---------- */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    unit: "個",
    current_stock: "0",
    min_stock: "0",
    unit_cost: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const resetForm = () => {
    setForm({
      name: "",
      sku: "",
      category: "",
      unit: "個",
      current_stock: "0",
      min_stock: "0",
      unit_cost: "",
      note: "",
    });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/inventory/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          current_stock: Number(form.current_stock) || 0,
          min_stock: Number(form.min_stock) || 0,
          unit_cost: form.unit_cost ? parseInt(form.unit_cost, 10) : null,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setMsg({ text: `在庫「${j.item?.name ?? form.name}」を登録しました`, ok: true });
      resetForm();
      setShowForm(false);
      mutate();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Edit ---------- */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    category: "",
    unit: "個",
    min_stock: "0",
    unit_cost: "",
    note: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      sku: item.sku ?? "",
      category: item.category ?? "",
      unit: item.unit,
      min_stock: String(item.min_stock),
      unit_cost: item.unit_cost != null ? String(item.unit_cost) : "",
      note: item.note ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/inventory/items/${editingId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          min_stock: Number(editForm.min_stock) || 0,
          unit_cost: editForm.unit_cost ? parseInt(editForm.unit_cost, 10) : null,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setEditingId(null);
      setMsg({ text: "在庫情報を更新しました", ok: true });
      mutate();
    } catch (e: unknown) {
      alert("更新に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEditSaving(false);
    }
  };

  /* ---------- Stock movement ---------- */
  const [movingItem, setMovingItem] = useState<InventoryItem | null>(null);
  const [moveType, setMoveType] = useState<"in" | "out" | "adjust">("in");
  const [moveQuantity, setMoveQuantity] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  const openMove = (item: InventoryItem, type: "in" | "out" | "adjust") => {
    setMovingItem(item);
    setMoveType(type);
    setMoveQuantity("");
    setMoveReason("");
  };

  const submitMove = async () => {
    if (!movingItem) return;
    const qty = Number(moveQuantity);
    if (!Number.isFinite(qty) || qty < 0) {
      alert("数量は 0 以上の数値を入力してください");
      return;
    }
    setMoveSaving(true);
    try {
      const res = await fetch("/api/admin/inventory/movements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_id: movingItem.id,
          type: moveType,
          quantity: qty,
          reason: moveReason.trim() || null,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      const label = moveType === "in" ? "入庫" : moveType === "out" ? "出庫" : "棚卸調整";
      setMsg({ text: `${movingItem.name}：${label}を記録しました`, ok: true });
      setMovingItem(null);
      mutate();
      if (showHistory) mutateHistory();
    } catch (e: unknown) {
      alert("記録に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMoveSaving(false);
    }
  };

  /* ---------- Delete ---------- */
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("この在庫アイテムを無効化しますか？履歴は保持されます。")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/inventory/items/${id}`, { method: "DELETE" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setMsg({ text: "無効化しました", ok: true });
      mutate();
    } catch (e: unknown) {
      alert("無効化に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="在庫管理"
        title="在庫マスタ"
        description="在庫アイテム・入出庫の記録と管理"
        actions={
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowHistory(!showHistory);
              }}
            >
              {showHistory ? "履歴を閉じる" : "入出庫履歴"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setShowForm(!showForm);
                setMsg(null);
              }}
            >
              {showForm ? "閉じる" : "新規登録"}
            </button>
          </div>
        }
      />

      {err && <div className="glass-card p-4 text-sm text-danger-text">{err}</div>}

      {data && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">登録数</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.total}</div>
              <div className="mt-1 text-xs text-muted">在庫アイテム</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">在庫不足</div>
              <div
                className={`mt-2 text-2xl font-bold ${data.stats.low_stock_count > 0 ? "text-danger" : "text-primary"}`}
              >
                {data.stats.low_stock_count}
              </div>
              <div className="mt-1 text-xs text-muted">最低在庫を下回るアイテム</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">在庫評価額</div>
              <div className="mt-2 text-2xl font-bold text-primary">{formatJpy(data.stats.total_value)}</div>
              <div className="mt-1 text-xs text-muted">(単価 × 現在庫)の合計</div>
            </div>
          </section>

          {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}

          {/* Create */}
          {showForm && (
            <section className="glass-card p-5 space-y-4">
              <div className="text-base font-semibold text-primary">新規在庫アイテム</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="品目名" required>
                  <input
                    type="text"
                    className="input-field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例: コーティング剤A"
                  />
                </Field>
                <Field label="SKU">
                  <input
                    type="text"
                    className="input-field"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="例: COAT-A-500ML"
                  />
                </Field>
                <Field label="カテゴリ">
                  <input
                    type="text"
                    className="input-field"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="例: 施工資材"
                  />
                </Field>
                <Field label="単位">
                  <input
                    type="text"
                    className="input-field"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="個 / 本 / 箱"
                  />
                </Field>
                <Field label="現在庫">
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    step="0.01"
                    value={form.current_stock}
                    onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  />
                </Field>
                <Field label="最低在庫（アラート閾値）">
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    step="0.01"
                    value={form.min_stock}
                    onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                  />
                </Field>
                <Field label="単価（円）">
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    value={form.unit_cost}
                    onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                  />
                </Field>
                <Field label="メモ">
                  <input
                    type="text"
                    className="input-field"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="仕入先・保管場所など"
                  />
                </Field>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !form.name.trim()}
                  onClick={handleCreate}
                >
                  {saving ? "登録中…" : "登録"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Filter */}
          <section className="glass-card p-5">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1">
                <label className="text-xs text-muted">検索</label>
                <input
                  type="search"
                  className="input-field"
                  placeholder="品目名 / SKU / カテゴリ"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-secondary">
                <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
                在庫不足のみ
              </label>
              <label className="flex items-center gap-2 text-sm text-secondary">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                無効を含む
              </label>
            </div>
          </section>

          {/* Items table */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5 text-base font-semibold text-primary">在庫一覧</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">品目</th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      SKU / カテゴリ
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">現在庫</th>
                    <th className="hidden sm:table-cell text-right px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      最低
                    </th>
                    <th className="hidden sm:table-cell text-right px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      単価
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {(data.items ?? []).map((item) => {
                    const isLow = Number(item.current_stock) <= Number(item.min_stock) && Number(item.min_stock) > 0;
                    const editing = editingId === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-surface-hover/60 align-top">
                        {editing ? (
                          <>
                            <td className="px-5 py-3">
                              <input
                                type="text"
                                className="input-field py-1 text-sm"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              />
                            </td>
                            <td className="hidden md:table-cell px-5 py-3 space-y-1">
                              <input
                                type="text"
                                className="input-field py-1 text-xs"
                                placeholder="SKU"
                                value={editForm.sku}
                                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                              />
                              <input
                                type="text"
                                className="input-field py-1 text-xs"
                                placeholder="カテゴリ"
                                value={editForm.category}
                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              />
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-primary whitespace-nowrap">
                              {item.current_stock} {editForm.unit || item.unit}
                              <div className="text-[10px] text-muted">入出庫で更新</div>
                            </td>
                            <td className="hidden sm:table-cell px-5 py-3">
                              <input
                                type="number"
                                className="input-field py-1 text-sm text-right"
                                min="0"
                                step="0.01"
                                value={editForm.min_stock}
                                onChange={(e) => setEditForm({ ...editForm, min_stock: e.target.value })}
                              />
                            </td>
                            <td className="hidden sm:table-cell px-5 py-3">
                              <input
                                type="number"
                                className="input-field py-1 text-sm text-right"
                                min="0"
                                value={editForm.unit_cost}
                                onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })}
                              />
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="btn-primary px-3 py-1 text-xs"
                                  disabled={editSaving || !editForm.name.trim()}
                                  onClick={saveEdit}
                                >
                                  {editSaving ? "保存中…" : "保存"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost px-3 py-1 text-xs"
                                  onClick={() => setEditingId(null)}
                                >
                                  取消
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-primary">{item.name}</div>
                              {item.note && <div className="text-[11px] text-muted">{item.note}</div>}
                              {!item.is_active && (
                                <div className="mt-1">
                                  <Badge variant="default">無効</Badge>
                                </div>
                              )}
                            </td>
                            <td className="hidden md:table-cell px-5 py-3.5 text-secondary text-xs">
                              {item.sku && <div className="font-mono">{item.sku}</div>}
                              {item.category && <div>{item.category}</div>}
                              {!item.sku && !item.category && "-"}
                            </td>
                            <td className="px-5 py-3.5 text-right font-bold whitespace-nowrap">
                              <span className={isLow ? "text-danger" : "text-primary"}>
                                {Number(item.current_stock)}
                              </span>
                              <span className="ml-1 text-xs text-muted">{item.unit}</span>
                              {isLow && <div className="mt-0.5 text-[10px] font-semibold text-danger">在庫不足</div>}
                            </td>
                            <td className="hidden sm:table-cell px-5 py-3.5 text-right text-secondary">
                              {Number(item.min_stock)}
                            </td>
                            <td className="hidden sm:table-cell px-5 py-3.5 text-right text-secondary">
                              {item.unit_cost != null ? formatJpy(item.unit_cost) : "-"}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  className="btn-ghost px-2 py-1 text-xs border border-success/30 text-success hover:bg-success-dim"
                                  onClick={() => openMove(item, "in")}
                                >
                                  + 入庫
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost px-2 py-1 text-xs border border-warning/30 text-warning hover:bg-warning-dim"
                                  onClick={() => openMove(item, "out")}
                                >
                                  - 出庫
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost px-2 py-1 text-xs"
                                  onClick={() => openMove(item, "adjust")}
                                >
                                  棚卸
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost px-2 py-1 text-xs"
                                  onClick={() => startEdit(item)}
                                >
                                  編集
                                </button>
                                {item.is_active && (
                                  <button
                                    type="button"
                                    className="btn-danger px-2 py-1 text-xs"
                                    disabled={deletingId === item.id}
                                    onClick={() => handleDelete(item.id)}
                                  >
                                    {deletingId === item.id ? "無効化中…" : "無効化"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {(data.items ?? []).length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-muted">
                        在庫アイテムはありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* History */}
          {showHistory && (
            <section className="glass-card overflow-hidden">
              <div className="border-b border-border-subtle p-5 text-base font-semibold text-primary">
                入出庫履歴（最新100件）
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">日時</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">種別</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">品目</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">数量</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">理由</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {(movementsData?.movements ?? []).map((m) => (
                      <tr key={m.id}>
                        <td className="px-5 py-3 text-secondary whitespace-nowrap">{formatDate(m.created_at)}</td>
                        <td className="px-5 py-3">
                          <Badge variant={m.type === "in" ? "success" : m.type === "out" ? "default" : "default"}>
                            {m.type === "in" ? "入庫" : m.type === "out" ? "出庫" : "棚卸"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-primary">{m.inventory_items?.name ?? "-"}</td>
                        <td className="px-5 py-3 text-right text-primary font-medium whitespace-nowrap">
                          {m.type === "out" ? "-" : m.type === "in" ? "+" : "→"}
                          {Number(m.quantity)}
                          <span className="ml-1 text-xs text-muted">{m.inventory_items?.unit ?? ""}</span>
                        </td>
                        <td className="px-5 py-3 text-secondary">{m.reason ?? "-"}</td>
                      </tr>
                    ))}
                    {(movementsData?.movements ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-muted">
                          履歴はまだありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Movement modal */}
      {movingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">
                {moveType === "in" ? "入庫記録" : moveType === "out" ? "出庫記録" : "棚卸調整"}
              </div>
              <div className="mt-1 text-lg font-bold text-primary">{movingItem.name}</div>
              <div className="text-xs text-muted">
                現在庫 {Number(movingItem.current_stock)} {movingItem.unit}
              </div>
            </div>
            <Field
              label={moveType === "adjust" ? `調整後の在庫数（${movingItem.unit}）` : `数量（${movingItem.unit}）`}
              required
            >
              <input
                type="number"
                className="input-field"
                min="0"
                step="0.01"
                value={moveQuantity}
                onChange={(e) => setMoveQuantity(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="理由 / メモ">
              <input
                type="text"
                className="input-field"
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                placeholder={
                  moveType === "in" ? "仕入れ / 返品など" : moveType === "out" ? "施工使用 / 廃棄など" : "棚卸結果"
                }
              />
            </Field>
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn-ghost" onClick={() => setMovingItem(null)}>
                キャンセル
              </button>
              <button type="button" className="btn-primary" disabled={moveSaving || !moveQuantity} onClick={submitMove}>
                {moveSaving ? "記録中…" : "記録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
