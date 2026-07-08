"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState } from "react";
import Link from "next/link";
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
  customer_type: "individual" | "corporate" | null;
  billing_cycle: "per_job" | "consolidated" | null;
  billing_terms_note: string | null;
  corporate_number: string | null;
  invoice_registration_number: string | null;
  short_name: string | null;
  honorific: "御中" | "様" | "" | null;
  transfer_fee_payer: "customer" | "company" | null;
  document_delivery_method: "download" | "email" | null;
  nda_status: "signed" | "unsigned" | null;
  basic_contract_status: "signed" | "unsigned" | null;
  created_at: string;
  updated_at: string | null;
};

const CUSTOMER_TYPE_LABEL: Record<string, string> = { individual: "個人", corporate: "法人" };
const BILLING_CYCLE_LABEL: Record<string, string> = { per_job: "都度払い", consolidated: "合算 (締め払い)" };
const TRANSFER_FEE_PAYER_LABEL: Record<string, string> = { customer: "先方負担", company: "当方負担" };
const DOCUMENT_DELIVERY_METHOD_LABEL: Record<string, string> = { download: "DLページ方式", email: "メール添付方式" };
const CONTRACT_STATUS_LABEL: Record<string, string> = { signed: "済", unsigned: "未" };

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
    customer_type: customer.customer_type ?? "individual",
    billing_cycle: customer.billing_cycle ?? "",
    billing_terms_note: customer.billing_terms_note ?? "",
    corporate_number: customer.corporate_number ?? "",
    invoice_registration_number: customer.invoice_registration_number ?? "",
    short_name: customer.short_name ?? "",
    honorific: customer.honorific ?? "",
    transfer_fee_payer: customer.transfer_fee_payer ?? "",
    document_delivery_method: customer.document_delivery_method ?? "",
    nda_status: customer.nda_status ?? "unsigned",
    basic_contract_status: customer.basic_contract_status ?? "unsigned",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      // 個人ならサイクルは常に null、法人でも未選択は null に寄せる ("" は enum 不一致)。
      const billing_cycle = form.customer_type === "corporate" && form.billing_cycle ? form.billing_cycle : null;
      const honorific = form.honorific || null;
      const transfer_fee_payer = form.transfer_fee_payer || null;
      const document_delivery_method = form.document_delivery_method || null;
      const res = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: customer.id,
          ...form,
          billing_cycle,
          honorific,
          transfer_fee_payer,
          document_delivery_method,
        }),
      });
      const j = await parseJsonSafe(res);
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
            <label className="text-xs text-muted">
              顧客名 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">フリガナ</label>
            <input
              type="text"
              value={form.name_kana}
              onChange={(e) => setForm({ ...form, name_kana: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">メールアドレス</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">電話番号</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">郵便番号</label>
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">住所</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">顧客略称名</label>
            <input
              type="text"
              value={form.short_name}
              onChange={(e) => setForm({ ...form, short_name: e.target.value })}
              className="input-field"
              placeholder="画面表示用の略称 (書類は顧客名を使用)"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">敬称</label>
            <select
              value={form.honorific}
              onChange={(e) => setForm({ ...form, honorific: e.target.value as "" | "御中" | "様" })}
              className="input-field"
            >
              <option value="">未設定</option>
              <option value="御中">御中</option>
              <option value="様">様</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">振込手数料負担</label>
            <select
              value={form.transfer_fee_payer}
              onChange={(e) => setForm({ ...form, transfer_fee_payer: e.target.value as "" | "customer" | "company" })}
              className="input-field"
            >
              <option value="">未設定</option>
              <option value="customer">先方負担</option>
              <option value="company">当方負担</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">書類送付方法</label>
            <select
              value={form.document_delivery_method}
              onChange={(e) =>
                setForm({ ...form, document_delivery_method: e.target.value as "" | "download" | "email" })
              }
              className="input-field"
            >
              <option value="">未設定</option>
              <option value="download">DLページ方式</option>
              <option value="email">メール添付方式</option>
            </select>
          </div>
        </div>
        {/* 顧客区分 + 法人の支払い条件 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">顧客区分</label>
            <select
              value={form.customer_type}
              onChange={(e) => setForm({ ...form, customer_type: e.target.value as "individual" | "corporate" })}
              className="input-field"
            >
              <option value="individual">個人 (BtoC)</option>
              <option value="corporate">法人 (BtoB)</option>
            </select>
          </div>
          {form.customer_type === "corporate" && (
            <div className="space-y-1">
              <label className="text-xs text-muted">
                支払いサイクル <span className="text-danger">*</span>
              </label>
              <select
                value={form.billing_cycle}
                onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
                className="input-field"
              >
                <option value="">— 選択してください —</option>
                <option value="per_job">都度払い (案件ごとに会計)</option>
                <option value="consolidated">合算・締め払い (後日まとめて請求)</option>
              </select>
            </div>
          )}
        </div>
        {form.customer_type === "corporate" && (
          <div className="space-y-1">
            <label className="text-xs text-muted">支払い条件メモ (締め日・支払いサイト等)</label>
            <input
              type="text"
              value={form.billing_terms_note}
              onChange={(e) => setForm({ ...form, billing_terms_note: e.target.value })}
              className="input-field"
              placeholder="例: 月末締め翌月末払い"
            />
          </div>
        )}
        {form.customer_type === "corporate" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted">法人番号</label>
              <input
                type="text"
                value={form.corporate_number}
                onChange={(e) => setForm({ ...form, corporate_number: e.target.value })}
                className="input-field"
                placeholder="13桁の数字"
                maxLength={13}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">インボイス登録番号</label>
              <input
                type="text"
                value={form.invoice_registration_number}
                onChange={(e) => setForm({ ...form, invoice_registration_number: e.target.value })}
                className="input-field"
                placeholder="T + 13桁の数字"
                maxLength={14}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">NDA締結</label>
              <select
                value={form.nda_status}
                onChange={(e) => setForm({ ...form, nda_status: e.target.value as "signed" | "unsigned" })}
                className="input-field"
              >
                <option value="unsigned">未</option>
                <option value="signed">済</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">基本契約書締結</label>
              <select
                value={form.basic_contract_status}
                onChange={(e) => setForm({ ...form, basic_contract_status: e.target.value as "signed" | "unsigned" })}
                className="input-field"
              >
                <option value="unsigned">未</option>
                <option value="signed">済</option>
              </select>
            </div>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted">備考</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="input-field"
            rows={2}
          />
        </div>
        {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}
        <div className="flex gap-3">
          <button type="button" className="btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? "更新中…" : "更新"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
            キャンセル
          </button>
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
        <div className="flex gap-2 flex-wrap">
          <Link href={`/admin/certificates/new?customer_id=${customer.id}`} className="btn-primary text-xs">
            証明書発行を開始
          </Link>
          <Link href={`/admin/invoices/new?customer_id=${customer.id}`} className="btn-secondary text-xs">
            請求書を作成
          </Link>
          <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
            編集
          </button>
        </div>
      </div>
      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}
      {infoRow("顧客区分", CUSTOMER_TYPE_LABEL[customer.customer_type ?? "individual"])}
      {customer.customer_type === "corporate" &&
        infoRow("支払いサイクル", customer.billing_cycle ? BILLING_CYCLE_LABEL[customer.billing_cycle] : "未設定")}
      {customer.customer_type === "corporate" && customer.billing_terms_note
        ? infoRow("支払い条件", customer.billing_terms_note)
        : null}
      {customer.customer_type === "corporate" && infoRow("法人番号", customer.corporate_number)}
      {customer.customer_type === "corporate" && infoRow("インボイス登録番号", customer.invoice_registration_number)}
      {customer.customer_type === "corporate" &&
        infoRow("NDA締結", CONTRACT_STATUS_LABEL[customer.nda_status ?? "unsigned"])}
      {customer.customer_type === "corporate" &&
        infoRow("基本契約書締結", CONTRACT_STATUS_LABEL[customer.basic_contract_status ?? "unsigned"])}
      {infoRow("フリガナ", customer.name_kana)}
      {infoRow("顧客略称名", customer.short_name)}
      {infoRow("敬称", customer.honorific)}
      {infoRow("メール", customer.email)}
      {infoRow("電話番号", customer.phone)}
      {infoRow("郵便番号", customer.postal_code)}
      {infoRow("住所", customer.address)}
      {infoRow(
        "振込手数料負担",
        customer.transfer_fee_payer ? TRANSFER_FEE_PAYER_LABEL[customer.transfer_fee_payer] : null,
      )}
      {infoRow(
        "書類送付方法",
        customer.document_delivery_method ? DOCUMENT_DELIVERY_METHOD_LABEL[customer.document_delivery_method] : null,
      )}
      {infoRow("備考", customer.note)}
      {infoRow("登録日", formatDate(customer.created_at))}
      {infoRow("更新日", formatDate(customer.updated_at))}
    </section>
  );
}
