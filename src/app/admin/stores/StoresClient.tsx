"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";

type Store = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager_name: string | null;
  business_hours: unknown;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  member_count: number;
  created_at: string;
};

export default function StoresClient() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formManager, setFormManager] = useState("");

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stores");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStores(data.stores ?? []);
    } catch {
      setError("店舗情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const resetForm = () => {
    setFormName("");
    setFormAddress("");
    setFormPhone("");
    setFormEmail("");
    setFormManager("");
    setEditingStore(null);
    setShowForm(false);
    setError(null);
  };

  const openEdit = (store: Store) => {
    setEditingStore(store);
    setFormName(store.name);
    setFormAddress(store.address ?? "");
    setFormPhone(store.phone ?? "");
    setFormEmail(store.email ?? "");
    setFormManager(store.manager_name ?? "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body = {
        ...(editingStore ? { id: editingStore.id } : {}),
        name: formName,
        address: formAddress,
        phone: formPhone,
        email: formEmail,
        manager_name: formManager,
      };

      const res = await fetch("/api/admin/stores", {
        method: editingStore ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存に失敗しました");
      }

      resetForm();
      fetchStores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (store: Store) => {
    try {
      const res = await fetch("/api/admin/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: store.id, is_active: !store.is_active }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
      fetchStores();
    } catch {
      setError("更新に失敗しました");
    }
  };

  const deleteStore = async (store: Store) => {
    if (!confirm(`「${store.name}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/admin/stores?id=${store.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除に失敗しました");
      }
      fetchStores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="STORES"
        title="店舗管理"
        description="店舗（拠点）の登録・管理を行います。"
        actions={
          !showForm ? (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="btn-primary"
            >
              + 新規店舗
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="glass-card p-3 text-sm text-red-400 glow-red">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-primary">
            {editingStore ? "店舗を編集" : "新規店舗を追加"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">店舗名 *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="input-field w-full"
                  placeholder="本店"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">店長名</label>
                <input
                  type="text"
                  value={formManager}
                  onChange={(e) => setFormManager(e.target.value)}
                  className="input-field w-full"
                  placeholder="山田太郎"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">住所</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="input-field w-full"
                  placeholder="東京都渋谷区..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">電話番号</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="input-field w-full"
                  placeholder="03-1234-5678"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">メールアドレス</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="store@example.com"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" loading={saving} disabled={saving}>
                {editingStore ? "更新" : "作成"}
              </Button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Store List */}
      {loading ? (
        <div className="glass-card p-8 text-center text-sm text-secondary">読み込み中...</div>
      ) : stores.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-secondary">
          まだ店舗が登録されていません。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <div key={store.id} className="glass-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-primary">{store.name}</h4>
                    {store.is_default && (
                      <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        デフォルト
                      </span>
                    )}
                    {!store.is_active && (
                      <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        無効
                      </span>
                    )}
                  </div>
                  {store.manager_name && (
                    <p className="mt-0.5 text-xs text-secondary">店長: {store.manager_name}</p>
                  )}
                </div>
                <span className="text-xs text-muted">{store.member_count}名</span>
              </div>

              {store.address && (
                <p className="text-xs text-secondary">{store.address}</p>
              )}

              <div className="flex flex-wrap gap-2 text-xs text-secondary">
                {store.phone && <span>{store.phone}</span>}
                {store.email && <span>{store.email}</span>}
              </div>

              <div className="flex gap-2 border-t border-border-subtle pt-2">
                <button
                  onClick={() => openEdit(store)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  編集
                </button>
                <button
                  onClick={() => toggleActive(store)}
                  className="text-xs font-medium text-secondary hover:underline"
                >
                  {store.is_active ? "無効にする" : "有効にする"}
                </button>
                {!store.is_default && (
                  <button
                    onClick={() => deleteStore(store)}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
