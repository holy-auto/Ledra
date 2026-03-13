"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

type Customer = {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

export default function CustomerDetailClient({ customer: initial }: { customer: Customer }) {
  const [customer, setCustomer] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: customer.name,
    name_kana: customer.name_kana ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    postal_code: customer.postal_code ?? "",
    address: customer.address ?? "",
    note: customer.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: customer.id, ...form }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setCustomer(j.customer);
      setEditing(false);
      setMsg({ text: "更新しました", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const infoRow = (label: string, value: string | null | undefined) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border-subtle">
      <div className="text-xs font-semibold text-muted w-24 shrink-0">{label}</div>
      <div className="text-sm text-primary">{value || "-"}</div>
    </div>
  );

  if (editing) {
    return (
      <section className="glass-card glow-cyan p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">EDIT</div>
          <div className="mt-1 text-base font-semibold text-primary">顧客情報を編集</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">顧客名 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">フリガナ</label>
            <input type="text" value={form.name_kana} onChange={(e) => setForm({ ...form, name_kana: e.target.value })} className="input-field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">メールアドレス</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">電話番号</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">郵便番号</label>
            <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className="input-field" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">住所</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-field" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted">備考</label>
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input-field" rows={2} />
        </div>
        {msg && <div className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-500"}`}>{msg.text}</div>}
        <div className="flex gap-3">
          <button type="button" className="btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? "更新中…" : "更新"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>キャンセル</button>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">CUSTOMER INFO</div>
          <div className="mt-1 text-lg font-bold text-primary">{customer.name}</div>
        </div>
        <button type="button" className="btn-ghost !text-xs" onClick={() => setEditing(true)}>編集</button>
      </div>
      {msg && <div className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-500"}`}>{msg.text}</div>}
      {infoRow("フリガナ", customer.name_kana)}
      {infoRow("メール", customer.email)}
      {infoRow("電話番号", customer.phone)}
      {infoRow("郵便番号", customer.postal_code)}
      {infoRow("住所", customer.address)}
      {infoRow("備考", customer.note)}
      {infoRow("登録日", formatDate(customer.created_at))}
      {infoRow("更新日", formatDate(customer.updated_at))}
    </section>
  );
}
