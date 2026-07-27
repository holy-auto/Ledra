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
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  member_count: number;
  created_at: string;
};

type TenantMember = { user_id: string; display_name: string | null; email: string | null };
type StoreMember = {
  user_id: string;
  role: "manager" | "staff";
  display_name: string | null;
  email: string | null;
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
  // 写真GPS整合チェックの基準となる店舗座標 (任意)。
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");

  // 担当者アサイン
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [membersStoreId, setMembersStoreId] = useState<string | null>(null);
  const [storeMembers, setStoreMembers] = useState<StoreMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<"manager" | "staff">("staff");
  const [memberSaving, setMemberSaving] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/members", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setTenantMembers(data.members ?? []);
      } catch {}
    })();
  }, []);

  const fetchStoreMembers = useCallback(async (storeId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/members`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStoreMembers(data.members ?? []);
    } catch {
      setStoreMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const toggleMembersPanel = (store: Store) => {
    if (membersStoreId === store.id) {
      setMembersStoreId(null);
      return;
    }
    setMembersStoreId(store.id);
    setAddMemberUserId("");
    setAddMemberRole("staff");
    void fetchStoreMembers(store.id);
  };

  const addStoreMember = async () => {
    if (!membersStoreId || !addMemberUserId) return;
    setMemberSaving(true);
    try {
      const res = await fetch(`/api/admin/stores/${membersStoreId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: addMemberUserId, role: addMemberRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "追加に失敗しました");
      }
      setAddMemberUserId("");
      await fetchStoreMembers(membersStoreId);
      fetchStores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setMemberSaving(false);
    }
  };

  const removeStoreMember = async (userId: string) => {
    if (!membersStoreId) return;
    try {
      const res = await fetch(`/api/admin/stores/${membersStoreId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error("解除に失敗しました");
      await fetchStoreMembers(membersStoreId);
      fetchStores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "解除に失敗しました");
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormAddress("");
    setFormPhone("");
    setFormEmail("");
    setFormManager("");
    setFormLat("");
    setFormLng("");
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
    setFormLat(store.latitude != null ? String(store.latitude) : "");
    setFormLng(store.longitude != null ? String(store.longitude) : "");
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
        // 常に送る (空文字は API 側で null 化)。他フィールドと同様、省略で既存値を消さない。
        latitude: formLat.trim(),
        longitude: formLng.trim(),
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
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="btn-primary"
            >
              + 新規店舗
            </button>
          ) : undefined
        }
      />

      {error && <div className="glass-card p-3 text-sm text-red-400 glow-red">{error}</div>}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-primary">{editingStore ? "店舗を編集" : "新規店舗を追加"}</h3>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-secondary">緯度 (任意)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value)}
                    className="input-field w-full"
                    placeholder="35.6586"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-secondary">経度 (任意)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={formLng}
                    onChange={(e) => setFormLng(e.target.value)}
                    className="input-field w-full"
                    placeholder="139.7454"
                  />
                </div>
                <p className="col-span-2 text-[11px] text-muted">
                  写真GPSと店舗位置の整合性チェックの基準に使います (未入力可)。
                </p>
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
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-sm text-secondary">
            店舗がまだ登録されていません。現在のテナント情報が1店舗目として使用されます。
          </p>
          <p className="text-xs text-muted">
            「+ 新規店舗」から現在の店舗情報を登録すると、店舗別の管理が可能になります。
          </p>
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
                      <span className="inline-flex items-center rounded bg-accent-dim px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                        デフォルト
                      </span>
                    )}
                    {!store.is_active && (
                      <span className="inline-flex items-center rounded bg-surface-active px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        無効
                      </span>
                    )}
                  </div>
                  {store.manager_name && <p className="mt-0.5 text-xs text-secondary">店長: {store.manager_name}</p>}
                </div>
                <span className="text-xs text-muted">{store.member_count}名</span>
              </div>

              {store.address && <p className="text-xs text-secondary">{store.address}</p>}

              <div className="flex flex-wrap gap-2 text-xs text-secondary">
                {store.phone && <span>{store.phone}</span>}
                {store.email && <span>{store.email}</span>}
              </div>

              <div className="flex gap-2 border-t border-border-subtle pt-2">
                <button onClick={() => openEdit(store)} className="text-xs font-medium text-accent hover:underline">
                  編集
                </button>
                <button
                  onClick={() => toggleActive(store)}
                  className="text-xs font-medium text-secondary hover:underline"
                >
                  {store.is_active ? "無効にする" : "有効にする"}
                </button>
                <button
                  onClick={() => toggleMembersPanel(store)}
                  className="text-xs font-medium text-secondary hover:underline"
                >
                  担当者 {membersStoreId === store.id ? "▲" : "▼"}
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

              {/* 担当者アサイン */}
              {membersStoreId === store.id && (
                <div className="space-y-2 border-t border-border-subtle pt-3">
                  {membersLoading ? (
                    <p className="text-[11px] text-muted">読み込み中…</p>
                  ) : (
                    <>
                      {storeMembers.length === 0 && (
                        <p className="text-[11px] text-muted">担当者はまだ割り当てられていません。</p>
                      )}
                      {storeMembers.map((m) => (
                        <div key={m.user_id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-secondary">
                            {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                                m.role === "manager" ? "bg-accent-dim text-accent-text" : "bg-surface-active text-muted"
                              }`}
                            >
                              {m.role === "manager" ? "店長" : "担当"}
                            </span>
                          </span>
                          <button
                            onClick={() => removeStoreMember(m.user_id)}
                            className="text-[11px] text-red-500 hover:underline"
                          >
                            解除
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <select
                          className="select-field flex-1 min-w-[120px] text-xs py-1"
                          value={addMemberUserId}
                          onChange={(e) => setAddMemberUserId(e.target.value)}
                        >
                          <option value="">メンバーを選択...</option>
                          {tenantMembers
                            .filter((tm) => !storeMembers.some((sm) => sm.user_id === tm.user_id))
                            .map((tm) => (
                              <option key={tm.user_id} value={tm.user_id}>
                                {tm.display_name ?? tm.email ?? tm.user_id.slice(0, 8)}
                              </option>
                            ))}
                        </select>
                        <select
                          className="select-field text-xs py-1"
                          value={addMemberRole}
                          onChange={(e) => setAddMemberRole(e.target.value as "manager" | "staff")}
                        >
                          <option value="staff">担当</option>
                          <option value="manager">店長</option>
                        </select>
                        <button
                          onClick={addStoreMember}
                          disabled={!addMemberUserId || memberSaving}
                          className="btn-secondary text-xs px-2 py-1"
                        >
                          追加
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
