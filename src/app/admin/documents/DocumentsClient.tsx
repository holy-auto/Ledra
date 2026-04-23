"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import {
  DOC_TYPES,
  DOC_TYPE_LIST,
  STATUS_OPTIONS,
  statusLabel,
  statusVariant,
  type DocType,
  type DocumentRow,
  type DocumentItem,
} from "@/types/document";

type Customer = { id: string; name: string };
type MenuItem = { id: string; name: string; description: string | null; unit_price: number; tax_category: number };
type Stats = { total: number; unpaid_amount: number };
type DocumentsData = { documents: DocumentRow[]; stats: Stats };
type TemplateOption = { id: string; name: string; doc_type: string | null };

const emptyItem = (): DocumentItem => ({
  description: "",
  quantity: 1,
  unit_price: 0,
  amount: 0,
});

export default function DocumentsClient({ initialTypeFilter }: { initialTypeFilter?: string } = {}) {
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customer_id") ?? "";
  const autoOpenForm = searchParams.get("create") === "1";

  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>(initialTypeFilter ?? "all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("all");

  // Build SWR key
  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeTypeFilter && activeTypeFilter !== "all") params.set("doc_type", activeTypeFilter);
    if (activeStatusFilter && activeStatusFilter !== "all") params.set("status", activeStatusFilter);
    return `/api/admin/documents?${params.toString()}`;
  })();

  const {
    data: swrData,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<DocumentsData>(swrKey, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const docs = swrData?.documents ?? [];
  const stats = swrData?.stats ?? { total: 0, unpaid_amount: 0 };
  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  // Create form
  const [showForm, setShowForm] = useState(autoOpenForm);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [formDocType, setFormDocType] = useState<DocType>(
    initialTypeFilter && initialTypeFilter in DOC_TYPES ? (initialTypeFilter as DocType) : "estimate",
  );
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formRecipientName, setFormRecipientName] = useState("");
  const [formRecipientHonorific, setFormRecipientHonorific] = useState<"御中" | "様" | "">("御中");
  const [formRecipientPostalCode, setFormRecipientPostalCode] = useState("");
  const [formRecipientAddress, setFormRecipientAddress] = useState("");
  const [formRecipientPhone, setFormRecipientPhone] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formPeriodStart, setFormPeriodStart] = useState("");
  const [formPeriodEnd, setFormPeriodEnd] = useState("");
  const [formPaymentTerms, setFormPaymentTerms] = useState("");
  const [formDeliveryDate, setFormDeliveryDate] = useState("");
  const [formTemplateId, setFormTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [formIssuedAt, setFormIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [formDueDate, setFormDueDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formItems, setFormItems] = useState<DocumentItem[]>([emptyItem()]);
  const [formTaxRate, setFormTaxRate] = useState(10);
  const [formInvoiceCompliant, setFormInvoiceCompliant] = useState(false);
  const [formShowSeal, setFormShowSeal] = useState(false);
  const [formShowLogo, setFormShowLogo] = useState(true);
  const [formShowBankInfo, setFormShowBankInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reference data: customers + menuItems (one-time fetch)
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers", { cache: "no-store" });
      const j = await res.json().catch((): null => null);
      if (res.ok && j?.customers) {
        setCustomers(j.customers.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch {}
  }, []);

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/menu-items?active_only=true", { cache: "no-store" });
      const j = await res.json().catch((): null => null);
      if (res.ok && j?.items) {
        setMenuItems(
          j.items.map((m: any) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            unit_price: m.unit_price,
            tax_category: m.tax_category,
          })),
        );
      }
    } catch {}
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/document-templates", { cache: "no-store" });
      const j = await res.json().catch((): null => null);
      if (res.ok && j?.templates) {
        setTemplates(j.templates.map((t: any) => ({ id: t.id, name: t.name, doc_type: t.doc_type })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchCustomers(), fetchMenuItems(), fetchTemplates()]);
  }, [fetchCustomers, fetchMenuItems, fetchTemplates]);

  // URL クエリ (customer_id) からの自動入力
  // ワークフローや飛び込み案件の「見積書を作成」から遷移した際に、
  // 下部フォームの顧客フィールドにも反映される。
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillCustomerId) return;
    if (customers.length === 0) return; // 顧客マスター読込待ち
    setFormCustomerId(prefillCustomerId);
    prefillAppliedRef.current = true;
  }, [customers, prefillCustomerId]);

  const handleFilterChange = (newType: string, newStatus: string) => {
    setTypeFilter(newType);
    setStatusFilter(newStatus);
    setActiveTypeFilter(newType);
    setActiveStatusFilter(newStatus);
  };

  // Item management
  const updateItem = (index: number, field: keyof DocumentItem, value: string | number) => {
    const newItems = [...formItems];
    const item = { ...newItems[index] };
    if (field === "description") item.description = value as string;
    if (field === "quantity") item.quantity = parseInt(String(value), 10) || 0;
    if (field === "unit_price") item.unit_price = parseInt(String(value), 10) || 0;
    item.amount = item.quantity * item.unit_price;
    newItems[index] = item;
    setFormItems(newItems);
  };

  const addItem = () => setFormItems([...formItems, emptyItem()]);
  const removeItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const subtotal = formItems.reduce((s, i) => s + i.amount, 0);
  const tax = Math.floor(subtotal * (formTaxRate / 100));
  const total = subtotal + tax;

  const handleCreate = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc_type: formDocType,
          customer_id: formCustomerId || null,
          recipient_name: formRecipientName || null,
          recipient_honorific: formRecipientHonorific,
          recipient_postal_code: formRecipientPostalCode || null,
          recipient_address: formRecipientAddress || null,
          recipient_phone: formRecipientPhone || null,
          subject: formSubject || null,
          period_start: formPeriodStart || null,
          period_end: formPeriodEnd || null,
          payment_terms: formPaymentTerms || null,
          delivery_date: formDeliveryDate || null,
          template_id: formTemplateId || null,
          issued_at: formIssuedAt,
          due_date: formDueDate || null,
          note: formNote,
          items: formItems,
          tax_rate: formTaxRate,
          is_invoice_compliant: formInvoiceCompliant,
          show_seal: formShowSeal,
          show_logo: formShowLogo,
          show_bank_info: formShowBankInfo,
        }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      resetForm();
      const docLabel = DOC_TYPES[formDocType]?.label ?? formDocType;
      setSaveMsg({ text: `${docLabel} ${j.document?.doc_number} を作成しました`, ok: true });
      mutate();
    } catch (e: any) {
      setSaveMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormCustomerId("");
    setFormRecipientName("");
    setFormRecipientHonorific("御中");
    setFormRecipientPostalCode("");
    setFormRecipientAddress("");
    setFormRecipientPhone("");
    setFormSubject("");
    setFormPeriodStart("");
    setFormPeriodEnd("");
    setFormPaymentTerms("");
    setFormDeliveryDate("");
    setFormTemplateId("");
    setFormIssuedAt(new Date().toISOString().slice(0, 10));
    setFormDueDate("");
    setFormNote("");
    setFormItems([emptyItem()]);
    setFormTaxRate(10);
    setFormInvoiceCompliant(false);
    setFormShowSeal(false);
    setFormShowLogo(true);
    setFormShowBankInfo(false);
  };

  const handleMenuItemSelect = (menuItemId: string, itemIndex: number) => {
    const mi = menuItems.find((m) => m.id === menuItemId);
    if (!mi) return;
    const newItems = [...formItems];
    const item = { ...newItems[itemIndex] };
    item.description = mi.name + (mi.description ? ` (${mi.description})` : "");
    item.unit_price = mi.unit_price;
    item.amount = item.quantity * item.unit_price;
    newItems[itemIndex] = item;
    setFormItems(newItems);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この帳票を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      mutate();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  const docTypeLabel = (dt: string) => DOC_TYPES[dt as DocType]?.label ?? dt;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="帳票"
        title="帳票管理"
        description="見積書・納品書・請求書・領収書などの作成・管理を行います。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowForm(!showForm);
              setSaveMsg(null);
            }}
          >
            {showForm ? "閉じる" : "新規作成"}
          </button>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {swrData && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
              <div className="mt-2 text-2xl font-bold text-primary">{stats.total}</div>
              <div className="mt-1 text-xs text-muted">総帳票数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">未入金</div>
              <div className="mt-2 text-2xl font-bold text-primary">{formatJpy(stats.unpaid_amount)}</div>
              <div className="mt-1 text-xs text-muted">未入金額</div>
            </div>
          </section>

          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">書類種別</label>
                <select
                  className="select-field"
                  value={typeFilter}
                  onChange={(e) => handleFilterChange(e.target.value, statusFilter)}
                >
                  <option value="all">すべて</option>
                  {DOC_TYPE_LIST.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(typeFilter, e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {saveMsg && <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>{saveMsg.text}</div>}

          {/* Create Form */}
          {showForm && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規作成</div>
                <div className="mt-1 text-base font-semibold text-primary">新規帳票作成</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted">書類種別</label>
                  <select
                    className="select-field"
                    value={formDocType}
                    onChange={(e) => setFormDocType(e.target.value as DocType)}
                  >
                    {DOC_TYPE_LIST.map((dt) => (
                      <option key={dt.value} value={dt.value}>
                        {dt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">顧客</label>
                  <select
                    className="select-field"
                    value={formCustomerId}
                    onChange={(e) => {
                      setFormCustomerId(e.target.value);
                      if (e.target.value) setFormRecipientName("");
                    }}
                  >
                    <option value="">選択なし</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">宛先店舗名（BtoB用）</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="顧客未選択時に店舗名を直接入力"
                    value={formRecipientName}
                    onChange={(e) => {
                      setFormRecipientName(e.target.value);
                      if (e.target.value) setFormCustomerId("");
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">書類番号</label>
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
                {(formDocType === "invoice" || formDocType === "consolidated_invoice") && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted">支払期限</label>
                    <input
                      type="date"
                      className="input-field"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs text-muted">税率</label>
                  <select
                    className="select-field"
                    value={formTaxRate}
                    onChange={(e) => setFormTaxRate(parseInt(e.target.value, 10))}
                  >
                    <option value={10}>10%（標準税率）</option>
                    <option value={8}>8%（軽減税率）</option>
                  </select>
                </div>
              </div>

              {/* 宛先詳細 & 案件情報 */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <div className="text-xs font-semibold text-muted tracking-[0.18em]">
                  宛先詳細・案件情報（帳票に表示）
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">敬称</label>
                    <select
                      className="select-field"
                      value={formRecipientHonorific}
                      onChange={(e) => setFormRecipientHonorific(e.target.value as "御中" | "様" | "")}
                    >
                      <option value="御中">御中</option>
                      <option value="様">様</option>
                      <option value="">（なし）</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">宛先 郵便番号</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="123-4567"
                      value={formRecipientPostalCode}
                      onChange={(e) => setFormRecipientPostalCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-muted">宛先 住所</label>
                    <input
                      type="text"
                      className="input-field"
                      value={formRecipientAddress}
                      onChange={(e) => setFormRecipientAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">宛先 電話番号</label>
                    <input
                      type="tel"
                      className="input-field"
                      value={formRecipientPhone}
                      onChange={(e) => setFormRecipientPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-muted">件名</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例：○○工事 一式"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">期間（開始）</label>
                    <input
                      type="date"
                      className="input-field"
                      value={formPeriodStart}
                      onChange={(e) => setFormPeriodStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">期間（終了）</label>
                    <input
                      type="date"
                      className="input-field"
                      value={formPeriodEnd}
                      onChange={(e) => setFormPeriodEnd(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">支払条件</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例：月末締翌月末払"
                      value={formPaymentTerms}
                      onChange={(e) => setFormPaymentTerms(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">納期日</label>
                    <input
                      type="date"
                      className="input-field"
                      value={formDeliveryDate}
                      onChange={(e) => setFormDeliveryDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* テンプレート選択 */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1 min-w-[280px]">
                  <label className="text-xs text-muted">帳票テンプレート</label>
                  <select
                    className="select-field"
                    value={formTemplateId}
                    onChange={(e) => setFormTemplateId(e.target.value)}
                  >
                    <option value="">（既定のレイアウトを使用）</option>
                    {templates
                      .filter((t) => !t.doc_type || t.doc_type === formDocType)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.doc_type ? "" : "（共通）"}
                        </option>
                      ))}
                  </select>
                </div>
                <Link href="/admin/document-templates" className="btn-ghost text-xs" target="_blank">
                  テンプレートを管理 →
                </Link>
              </div>

              {/* Options */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formInvoiceCompliant}
                    onChange={(e) => setFormInvoiceCompliant(e.target.checked)}
                    className="rounded"
                  />
                  インボイス対応（適格請求書）
                </label>
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowSeal}
                    onChange={(e) => setFormShowSeal(e.target.checked)}
                    className="rounded"
                  />
                  角印を表示
                </label>
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowLogo}
                    onChange={(e) => setFormShowLogo(e.target.checked)}
                    className="rounded"
                  />
                  ロゴを表示
                </label>
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formShowBankInfo}
                    onChange={(e) => setFormShowBankInfo(e.target.checked)}
                    className="rounded"
                  />
                  口座情報を表示
                </label>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted tracking-[0.18em]">明細項目</div>
                {formItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5 space-y-1">
                      {idx === 0 && <label className="text-xs text-muted">内容</label>}
                      {menuItems.length > 0 && (
                        <select
                          className="select-field py-1 text-xs mb-1"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) handleMenuItemSelect(e.target.value, idx);
                          }}
                        >
                          <option value="">品目マスタから選択...</option>
                          {menuItems.map((mi) => (
                            <option key={mi.id} value={mi.id}>
                              {mi.name} ({formatJpy(mi.unit_price)})
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        className="input-field"
                        list={`doc-menu-list-${idx}`}
                        placeholder="品目・内容を入力 or 選択"
                        value={item.description}
                        onChange={(e) => {
                          updateItem(idx, "description", e.target.value);
                          const matched = menuItems.find((m) => m.name === e.target.value);
                          if (matched) {
                            updateItem(idx, "unit_price", String(matched.unit_price ?? 0));
                          }
                        }}
                      />
                      <datalist id={`doc-menu-list-${idx}`}>
                        {menuItems.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name} — ¥{(m.unit_price ?? 0).toLocaleString()}
                          </option>
                        ))}
                      </datalist>
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
                        className="btn-ghost px-2 py-1 text-xs text-danger"
                        onClick={() => removeItem(idx)}
                        disabled={formItems.length <= 1}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-ghost text-xs" onClick={addItem}>
                  + 明細を追加
                </button>
              </div>

              {/* Totals */}
              <div className="border-t border-border-subtle pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">小計</span>
                  <span className="text-primary">{formatJpy(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">消費税（{formTaxRate}%）</span>
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

              <div className="flex gap-3">
                <button type="button" className="btn-primary" disabled={saving} onClick={handleCreate}>
                  {saving ? "作成中…" : "下書き作成"}
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

          {/* Document List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">帳票一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">種別</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">書類番号</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      顧客名
                    </th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      発行日
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      ステータス
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <Badge variant={DOC_TYPES[doc.doc_type]?.color ?? "default"}>
                          {docTypeLabel(doc.doc_type)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/documents/${doc.id}`}
                          className="font-mono text-accent hover:text-accent underline"
                        >
                          {doc.doc_number}
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5 text-secondary">
                        {doc.recipient_name || doc.customer_name || "-"}
                      </td>
                      <td className="hidden md:table-cell px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(doc.issued_at)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-primary">{formatJpy(doc.total)}</td>
                      <td className="hidden sm:table-cell px-5 py-3.5">
                        <Badge variant={statusVariant(doc.status)}>{statusLabel(doc.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <Link href={`/admin/documents/${doc.id}`} className="btn-ghost px-3 py-1 text-xs">
                            詳細
                          </Link>
                          {doc.status === "draft" && (
                            <button
                              type="button"
                              className="btn-danger px-3 py-1 text-xs"
                              disabled={deletingId === doc.id}
                              onClick={() => handleDelete(doc.id)}
                            >
                              {deletingId === doc.id ? "削除中…" : "削除"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted">
                        帳票がありません
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
