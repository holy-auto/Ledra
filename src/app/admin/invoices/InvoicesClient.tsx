"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";

type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  certificate_id?: string | null;
  certificate_public_id?: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  issued_at: string | null;
  due_date: string | null;
  subtotal: number;
  tax: number;
  total: number;
  note: string | null;
  items_json: InvoiceItem[];
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
};

type CertificateOption = {
  id: string;
  public_id: string;
  customer_name: string;
  service_price: number | null;
  status: string;
  created_at: string;
};

type Stats = {
  total: number;
  unpaid_amount: number;
  this_month_issued: number;
};

type InvoicesData = {
  invoices: Invoice[];
  stats: Stats;
};

const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "sent", label: "送付済" },
  { value: "paid", label: "入金済" },
  { value: "overdue", label: "期限超過" },
  { value: "cancelled", label: "キャンセル" },
];

const statusVariant = (s: string) => {
  switch (s) {
    case "draft": return "default" as const;
    case "sent": return "info" as const;
    case "paid": return "success" as const;
    case "overdue": return "danger" as const;
    case "cancelled": return "warning" as const;
    default: return "default" as const;
  }
};

const statusLabel = (s: string) => {
  switch (s) {
    case "draft": return "下書き";
    case "sent": return "送付済";
    case "paid": return "入金済";
    case "overdue": return "期限超過";
    case "cancelled": return "キャンセル";
    default: return s;
  }
};

const emptyItem = (): InvoiceItem => ({ description: "", quantity: 1, unit_price: 0, amount: 0, certificate_id: null, certificate_public_id: null });

export default function InvoicesClient() {
  const [data, setData] = useState<InvoicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formIssuedAt, setFormIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [formDueDate, setFormDueDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formItems, setFormItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [formIsInvoiceCompliant, setFormIsInvoiceCompliant] = useState(false);
  const [formShowSeal, setFormShowSeal] = useState(false);
  const [formShowLogo, setFormShowLogo] = useState(true);
  const [formShowBankInfo, setFormShowBankInfo] = useState(false);
  const [formRecipientName, setFormRecipientName] = useState("");

  // Certificates for linking
  const [certificates, setCertificates] = useState<CertificateOption[]>([]);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async (status?: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/invoices?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setData(j as InvoicesData);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.customers) {
        setCustomers(j.customers.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchInvoices(), fetchCustomers()]);
      setLoading(false);
    })();
  }, [fetchInvoices, fetchCustomers]);

  // 顧客が変わったら証明書を取得
  const fetchCertificatesForCustomer = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCertificates([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/invoices?action=certificates&customer_id=${encodeURIComponent(customerId)}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.certificates) {
        setCertificates(j.certificates);
      } else {
        setCertificates([]);
      }
    } catch {
      setCertificates([]);
    }
  }, []);

  const handleCustomerChange = (val: string) => {
    setFormCustomerId(val);
    fetchCertificatesForCustomer(val);
  };

  const handleFilterChange = (val: string) => {
    setStatusFilter(val);
    fetchInvoices(val);
  };

  // Item management
  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...formItems];
    const item = { ...newItems[index] };
    if (field === "description") item.description = value as string;
    if (field === "quantity") item.quantity = parseInt(String(value), 10) || 0;
    if (field === "unit_price") item.unit_price = parseInt(String(value), 10) || 0;
    item.amount = item.quantity * item.unit_price;
    newItems[index] = item;
    setFormItems(newItems);
  };

  const linkCertificate = (index: number, certId: string) => {
    const newItems = [...formItems];
    const item = { ...newItems[index] };
    if (!certId) {
      item.certificate_id = null;
      item.certificate_public_id = null;
    } else {
      const cert = certificates.find((c) => c.id === certId);
      if (cert) {
        item.certificate_id = cert.id;
        item.certificate_public_id = cert.public_id;
        if (cert.service_price != null && cert.service_price > 0) {
          item.description = item.description || `施工証明書 ${cert.public_id}`;
          item.unit_price = cert.service_price;
          item.amount = item.quantity * cert.service_price;
        }
      }
    }
    newItems[index] = item;
    setFormItems(newItems);
  };

  const addItem = () => setFormItems([...formItems, emptyItem()]);
  const removeItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const subtotal = formItems.reduce((s, i) => s + i.amount, 0);
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;

  const handleCreate = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_id: formCustomerId || null,
          issued_at: formIssuedAt,
          due_date: formDueDate || null,
          note: formNote,
          items: formItems,
          is_invoice_compliant: formIsInvoiceCompliant,
          show_seal: formShowSeal,
          show_logo: formShowLogo,
          show_bank_info: formShowBankInfo,
          recipient_name: formRecipientName || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      setFormCustomerId("");
      setFormIssuedAt(new Date().toISOString().slice(0, 10));
      setFormDueDate("");
      setFormNote("");
      setFormItems([emptyItem()]);
      setFormIsInvoiceCompliant(false);
      setFormShowSeal(false);
      setFormShowLogo(true);
      setFormShowBankInfo(false);
      setFormRecipientName("");
      setSaveMsg({ text: `請求書 ${j.invoice?.invoice_number} を作成しました`, ok: true });
      await fetchInvoices(statusFilter);
    } catch (e: any) {
      setSaveMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この請求書を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await fetchInvoices(statusFilter);
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="INVOICES"
        title="請求書管理"
        description="請求書の作成・管理を行います。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setShowForm(!showForm); setSaveMsg(null); }}
          >
            {showForm ? "閉じる" : "新規作成"}
          </button>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {data && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">TOTAL</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.total}</div>
              <div className="mt-1 text-xs text-muted">総請求書数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">UNPAID</div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {formatJpy(data.stats.unpaid_amount)}
              </div>
              <div className="mt-1 text-xs text-muted">未入金額</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">THIS MONTH</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.this_month_issued}</div>
              <div className="mt-1 text-xs text-muted">今月発行</div>
            </div>
          </section>

          {/* Filter */}
          <section className="glass-card p-5">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータスで絞り込み</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {saveMsg && (
            <div className={`text-sm ${saveMsg.ok ? "text-emerald-400" : "text-red-500"}`}>
              {saveMsg.text}
            </div>
          )}

          {/* Create Form */}
          {showForm && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">NEW INVOICE</div>
                <div className="mt-1 text-base font-semibold text-primary">新規請求書</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted">顧客</label>
                  <select
                    className="select-field"
                    value={formCustomerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                  >
                    <option value="">選択なし</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">宛先店舗名（BtoB）</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例: 株式会社○○ 渋谷店"
                    value={formRecipientName}
                    onChange={(e) => setFormRecipientName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">請求番号</label>
                  <input type="text" className="input-field" placeholder="自動生成" disabled />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">発行日</label>
                  <input
                    type="date"
                    className="input-field"
                    value={formIssuedAt}
                    onChange={(e) => setFormIssuedAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">支払期限</label>
                  <input
                    type="date"
                    className="input-field"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted tracking-[0.18em]">LINE ITEMS</div>
                {formItems.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    {certificates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-muted whitespace-nowrap">証明書紐付け:</label>
                        <select
                          className="select-field !text-xs !py-1"
                          value={item.certificate_id ?? ""}
                          onChange={(e) => linkCertificate(idx, e.target.value)}
                        >
                          <option value="">紐付けなし</option>
                          {certificates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.public_id} — {c.service_price != null ? formatJpy(c.service_price) : "料金未設定"} ({c.status === "active" ? "有効" : c.status})
                            </option>
                          ))}
                        </select>
                        {item.certificate_id && (
                          <span className="text-[10px] text-emerald-400">✓ 紐付済</span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">内容</label>}
                        <input
                          type="text"
                          className="input-field"
                          placeholder="施工内容"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">数量</label>}
                        <input
                          type="number"
                          className="input-field"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">単価</label>}
                        <input
                          type="number"
                          className="input-field"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">金額</label>}
                        <div className="input-field bg-transparent text-secondary cursor-default">
                          {item.amount.toLocaleString("ja-JP")}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 !text-xs text-red-500"
                          onClick={() => removeItem(idx)}
                          disabled={formItems.length <= 1}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-ghost !text-xs" onClick={addItem}>
                  + 明細を追加
                </button>
                {formCustomerId && certificates.length === 0 && (
                  <div className="text-[10px] text-muted">※ この顧客に紐付く証明書がないか、証明書データの取得中です</div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t border-border-subtle pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">小計</span>
                  <span className="text-primary">{formatJpy(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">消費税（10%）</span>
                  <span className="text-primary">{formatJpy(tax)}</span>
                </div>
                <div className="flex justify-between text-base font-bold">
                  <span className="text-primary">合計</span>
                  <span className="text-primary">{formatJpy(total)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted">備考</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                />
              </div>

              {/* Options */}
              <div className="flex flex-wrap gap-4">
                <label className="text-sm text-secondary cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formIsInvoiceCompliant}
                    onChange={(e) => setFormIsInvoiceCompliant(e.target.checked)}
                  />
                  インボイス対応
                </label>
                <label className="text-sm text-secondary cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formShowSeal}
                    onChange={(e) => setFormShowSeal(e.target.checked)}
                  />
                  角印を表示
                </label>
                <label className="text-sm text-secondary cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formShowLogo}
                    onChange={(e) => setFormShowLogo(e.target.checked)}
                  />
                  ロゴを表示
                </label>
                <label className="text-sm text-secondary cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formShowBankInfo}
                    onChange={(e) => setFormShowBankInfo(e.target.checked)}
                  />
                  口座情報を表示
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={handleCreate}
                >
                  {saving ? "作成中…" : "下書き作成"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setShowForm(false); setFormItems([emptyItem()]); }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Invoice List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">INVOICE LIST</div>
              <div className="mt-1 text-base font-semibold text-primary">請求書一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">請求番号</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">顧客名</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">発行日</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">支払期限</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {(data.invoices ?? []).map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          className="font-mono text-[#0071e3] hover:text-[#0077ED] underline"
                        >
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-secondary">{inv.customer_name ?? "-"}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(inv.issued_at)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-primary">
                        {inv.total != null ? formatJpy(inv.total) : "-"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={statusVariant(inv.status)}>
                          {statusLabel(inv.status)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/invoices/${inv.id}`}
                            className="btn-ghost !px-3 !py-1 !text-xs"
                          >
                            詳細
                          </Link>
                          {inv.status === "draft" && (
                            <button
                              type="button"
                              className="btn-danger !px-3 !py-1 !text-xs"
                              disabled={deletingId === inv.id}
                              onClick={() => handleDelete(inv.id)}
                            >
                              {deletingId === inv.id ? "削除中…" : "削除"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.invoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted">
                        請求書がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
