"use client";

import { useState } from "react";
import useSWR from "swr";
import MutationGuard from "@/components/ui/MutationGuard";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { fetcher } from "@/lib/swr";

/**
 * CustomerBranches
 * ------------------------------------------------------------
 * 法人 (BtoB) 顧客の支店・営業所を登録・編集・削除する。
 * 顧客詳細画面の基本情報カードの下に配置し、個人顧客では描画しない。
 * データは /api/admin/customer-branches で顧客単位に取得・更新する。
 */

type Branch = {
  id: string;
  customer_id: string;
  name: string;
  name_kana: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  contact_person: string | null;
  contact_email: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

const emptyForm = {
  name: "",
  name_kana: "",
  postal_code: "",
  address: "",
  phone: "",
  contact_person: "",
  contact_email: "",
  note: "",
};

type BranchForm = typeof emptyForm;

export default function CustomerBranches({ customerId }: { customerId: string }) {
  const swrKey = `/api/admin/customer-branches?customer_id=${customerId}`;
  const { data, mutate } = useSWR<{ branches: Branch[] }>(swrKey, fetcher);
  const branches = data?.branches ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<BranchForm>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (b: Branch) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      name_kana: b.name_kana ?? "",
      postal_code: b.postal_code ?? "",
      address: b.address ?? "",
      phone: b.phone ?? "",
      contact_person: b.contact_person ?? "",
      contact_email: b.contact_email ?? "",
      note: b.note ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/customer-branches", {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : { customer_id: customerId, ...form }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      resetForm();
      setMsg({ text: editingId ? "支店を更新しました" : "支店を追加しました", ok: true });
      mutate();
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この支店を削除しますか？")) return;
    try {
      const res = await fetch("/api/admin/customer-branches", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      mutate();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    }
  };

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">BRANCHES</div>
          <div className="mt-1 text-base font-semibold text-primary">支店・営業所 ({branches.length}件)</div>
        </div>
        <MutationGuard>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => {
              if (showForm && !editingId) {
                resetForm();
              } else {
                setForm({ ...emptyForm });
                setEditingId(null);
                setShowForm(true);
                setMsg(null);
              }
            }}
          >
            {showForm && !editingId ? "閉じる" : "+ 支店を追加"}
          </button>
        </MutationGuard>
      </div>

      {msg && <div className={`px-5 pt-4 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}

      {showForm && (
        <div className="p-5 space-y-4 border-b border-border-subtle">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">
            {editingId ? "支店を編集" : "支店を登録"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted">
                支店名 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="東京支店"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">フリガナ</label>
              <input
                type="text"
                value={form.name_kana}
                onChange={(e) => setForm({ ...form, name_kana: e.target.value })}
                className="input-field"
                placeholder="トウキョウシテン"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">郵便番号</label>
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                className="input-field"
                placeholder="123-4567"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">住所</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input-field"
                placeholder="東京都渋谷区..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">電話番号</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field"
                placeholder="03-1234-5678"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">担当者名</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                className="input-field"
                placeholder="山田 太郎"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">担当者メール</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="input-field"
                placeholder="branch@example.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">備考</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="input-field"
              rows={2}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
              {saving ? "保存中…" : editingId ? "更新" : "登録"}
            </button>
            <button type="button" className="btn-ghost" onClick={resetForm}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border-subtle">
        {branches.map((b) => (
          <div key={b.id} className="px-5 py-3.5 hover:bg-surface-hover/60">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-primary">{b.name}</div>
                <div className="mt-1 space-y-0.5 text-xs text-secondary">
                  {b.address && (
                    <div>{[b.postal_code && `〒${b.postal_code}`, b.address].filter(Boolean).join(" ")}</div>
                  )}
                  {(b.phone || b.contact_person) && (
                    <div>
                      {b.contact_person && <span>担当: {b.contact_person}</span>}
                      {b.contact_person && b.phone && <span> / </span>}
                      {b.phone && <span>TEL: {b.phone}</span>}
                    </div>
                  )}
                  {b.contact_email && <div>{b.contact_email}</div>}
                  {b.note && <div className="text-muted">{b.note}</div>}
                </div>
              </div>
              <MutationGuard>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => startEdit(b)}>
                    編集
                  </button>
                  <button type="button" className="btn-danger px-3 py-1 text-xs" onClick={() => handleDelete(b.id)}>
                    削除
                  </button>
                </div>
              </MutationGuard>
            </div>
          </div>
        ))}
        {branches.length === 0 && !showForm && (
          <div className="px-5 py-8 text-center text-muted text-sm">
            支店が登録されていません。「+ 支店を追加」から登録できます。
          </div>
        )}
      </div>
    </section>
  );
}
