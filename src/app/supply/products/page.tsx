"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import type { SupplyPartnerProduct } from "@/types/supply";

type FormState = {
  sku: string;
  name: string;
  category: string;
  list_price: string;
  stock_status: string;
  lead_time_days: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  sku: "",
  name: "",
  category: "",
  list_price: "",
  stock_status: "",
  lead_time_days: "",
  is_active: true,
};

export default function SupplyProductsPage() {
  const [products, setProducts] = useState<SupplyPartnerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 一覧取得 (イベントハンドラからの再取得に使う)。effect 内では別途インライン定義する。
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/supply/products", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (j?.products) setProducts(j.products as SupplyPartnerProduct[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/supply/products", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!cancelled && j?.products) setProducts(j.products as SupplyPartnerProduct[]);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (p: SupplyPartnerProduct) => {
    setEditingId(p.id);
    setForm({
      sku: p.sku,
      name: p.name,
      category: p.category ?? "",
      list_price: p.list_price != null ? String(p.list_price) : "",
      stock_status: p.stock_status ?? "",
      lead_time_days: p.lead_time_days != null ? String(p.lead_time_days) : "",
      is_active: p.is_active,
    });
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: form.category.trim() || null,
        list_price: form.list_price.trim() ? Number(form.list_price) : null,
        stock_status: form.stock_status.trim() || null,
        lead_time_days: form.lead_time_days.trim() ? Number(form.lead_time_days) : null,
        is_active: form.is_active,
      };
      const res = await fetch("/api/supply/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "保存に失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: "保存しました。" });
      resetForm();
      await reload();
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("この商材を削除しますか？")) return;
    try {
      const res = await fetch("/api/supply/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: "削除に失敗しました。" });
        return;
      }
      if (editingId === id) resetForm();
      await reload();
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="SUPPLY PORTAL"
        title="商材カタログ"
        description="店舗が発注できる商材を登録します。品番は店舗側の在庫品目と紐付けられます。"
      />

      {/* Editor */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-primary">{editingId ? "商材を編集" : "商材を追加"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <div className="text-sm text-secondary mb-1">品番 (SKU) *</div>
            <input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="input-field w-full"
              placeholder="ABC-001"
            />
          </label>
          <label>
            <div className="text-sm text-secondary mb-1">商品名 *</div>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field w-full"
              placeholder="ガラスコーティング剤 500ml"
            />
          </label>
          <label>
            <div className="text-sm text-secondary mb-1">カテゴリ</div>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input-field w-full"
              placeholder="コーティング"
            />
          </label>
          <label>
            <div className="text-sm text-secondary mb-1">卸値 (円・税抜)</div>
            <input
              type="number"
              value={form.list_price}
              onChange={(e) => setForm({ ...form, list_price: e.target.value })}
              className="input-field w-full"
              placeholder="3000"
            />
          </label>
          <label>
            <div className="text-sm text-secondary mb-1">在庫状況</div>
            <input
              value={form.stock_status}
              onChange={(e) => setForm({ ...form, stock_status: e.target.value })}
              className="input-field w-full"
              placeholder="在庫あり"
            />
          </label>
          <label>
            <div className="text-sm text-secondary mb-1">リードタイム (日)</div>
            <input
              type="number"
              value={form.lead_time_days}
              onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
              className="input-field w-full"
              placeholder="3"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          有効 (店舗に表示する)
        </label>

        {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !form.sku.trim() || !form.name.trim()} className="btn-primary">
            {saving ? "保存中..." : editingId ? "更新" : "追加"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="btn-secondary" type="button">
              キャンセル
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="glass-card overflow-hidden">
        <div className="border-b border-border-subtle p-5">
          <h2 className="text-sm font-semibold text-primary">登録済み商材</h2>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-muted">読み込み中...</div>
        ) : products.length === 0 ? (
          <div className="p-5 text-sm text-muted">まだ商材が登録されていません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">品番</th>
                  <th className="px-5 py-2 font-medium">商品名</th>
                  <th className="px-5 py-2 font-medium">カテゴリ</th>
                  <th className="px-5 py-2 font-medium text-right">卸値</th>
                  <th className="px-5 py-2 font-medium">在庫</th>
                  <th className="px-5 py-2 font-medium">状態</th>
                  <th className="px-5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle/50">
                    <td className="px-5 py-2.5 font-mono text-xs text-secondary">{p.sku}</td>
                    <td className="px-5 py-2.5 text-primary">{p.name}</td>
                    <td className="px-5 py-2.5 text-muted">{p.category ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right text-secondary">
                      {p.list_price != null ? `¥${p.list_price.toLocaleString("ja-JP")}` : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-muted">{p.stock_status ?? "—"}</td>
                    <td className="px-5 py-2.5">
                      <span className={p.is_active ? "text-emerald-500" : "text-muted"}>
                        {p.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="text-accent hover:underline mr-3" type="button">
                        編集
                      </button>
                      <button onClick={() => remove(p.id)} className="text-red-500 hover:underline" type="button">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
