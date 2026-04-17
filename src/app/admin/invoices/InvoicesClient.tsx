"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";

type InvoiceItem = {
  description: string;
  quantity: number;
  unit: string;
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
  payment_date: string | null;
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

type VehicleOption = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  size_class: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  tax_category: number;
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
    case "draft":
      return "default" as const;
    case "sent":
      return "info" as const;
    case "paid":
      return "success" as const;
    case "overdue":
      return "danger" as const;
    case "cancelled":
      return "warning" as const;
    default:
      return "default" as const;
  }
};

const statusLabel = (s: string) => {
  switch (s) {
    case "draft":
      return "下書き";
    case "sent":
      return "送付済";
    case "paid":
      return "入金済";
    case "overdue":
      return "期限超過";
    case "cancelled":
      return "キャンセル";
    default:
      return s;
  }
};

const UNIT_OPTIONS = ["式", "台", "個", "セット", "本", "枚", "m", "m²", "時間"];

const emptyItem = (): InvoiceItem => ({
  description: "",
  quantity: 1,
  unit: "式",
  unit_price: 0,
  amount: 0,
  certificate_id: null,
  certificate_public_id: null,
});

export default function InvoicesClient() {
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customer_id") ?? "";
  const prefillVehicleId = searchParams.get("vehicle_id") ?? "";
  const autoOpenForm = searchParams.get("create") === "1";

  const [statusFilter, setStatusFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");

  // Build SWR key
  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeFilter && activeFilter !== "all") params.set("status", activeFilter);
    return `/api/admin/invoices?${params.toString()}`;
  })();

  const {
    data,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<InvoicesData>(swrKey, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  // Create form
  const [showForm, setShowForm] = useState(autoOpenForm);
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

  // Menu items (品目マスタ)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Vehicle selection
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formVehicleModel, setFormVehicleModel] = useState("");
  const [formVehiclePlate, setFormVehiclePlate] = useState("");
  const [formVehicleVin, setFormVehicleVin] = useState("");

  // Certificates for linking
  const [certificates, setCertificates] = useState<CertificateOption[]>([]);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Payment recording
  const [paymentTarget, setPaymentTarget] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  // Reference data: customers (one-time fetch)
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.customers) {
        setCustomers(j.customers.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch {}
  }, []);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vehicles", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.vehicles) {
        setVehicles(
          j.vehicles.map((v: any) => ({
            id: v.id,
            maker: v.maker,
            model: v.model,
            year: v.year,
            plate_display: v.plate_display,
            vin_code: v.vin_code,
            customer_id: v.customer_id ?? v.customer?.id ?? null,
            customer_name: v.customer?.name ?? null,
          })),
        );
      }
    } catch {}
  }, []);

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/menu-items?active_only=true", { cache: "no-store" });
      const j = await res.json().catch(() => null);
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

  useEffect(() => {
    Promise.all([fetchCustomers(), fetchMenuItems(), fetchVehicles()]);
  }, [fetchCustomers, fetchMenuItems, fetchVehicles]);

  // URL クエリ (customer_id / vehicle_id) からの自動入力
  // 顧客詳細やワークフローの「請求書を作成」から遷移した際に、
  // 下部フォームの顧客/車両フィールドにも反映される。
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillCustomerId && !prefillVehicleId) return;
    // 顧客/車両のマスターロードを待ってから1度だけ適用
    const customersReady = !prefillCustomerId || customers.length > 0;
    const vehiclesReady = !prefillVehicleId || vehicles.length > 0;
    if (!customersReady || !vehiclesReady) return;

    if (prefillVehicleId) {
      // 車両を選ぶと紐付け顧客が自動設定され、車両情報フィールドも反映される
      handleVehicleSelect(prefillVehicleId);
    }
    if (prefillCustomerId) {
      setFormCustomerId(prefillCustomerId);
      fetchCertificatesForCustomer(prefillCustomerId);
    }
    prefillAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, vehicles, prefillCustomerId, prefillVehicleId]);

  // 顧客が変わったら証明書を取得
  const fetchCertificatesForCustomer = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCertificates([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/invoices?action=certificates&customer_id=${encodeURIComponent(customerId)}`, {
        cache: "no-store",
      });
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

  const handleVehicleSelect = (vehicleId: string) => {
    setFormVehicleId(vehicleId);
    if (!vehicleId) {
      setFormVehicleModel("");
      setFormVehiclePlate("");
      setFormVehicleVin("");
      return;
    }
    const v = vehicles.find((veh) => veh.id === vehicleId);
    if (v) {
      const sizeTag = v.size_class ? ` [${v.size_class}]` : "";
      const modelStr = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") + sizeTag;
      setFormVehicleModel(modelStr);
      setFormVehiclePlate(v.plate_display ?? "");
      setFormVehicleVin(v.vin_code ?? "");
      // 車両に紐付き顧客がいて、顧客未選択なら自動選択
      if (v.customer_id && !formCustomerId) {
        setFormCustomerId(v.customer_id);
        fetchCertificatesForCustomer(v.customer_id);
      }
    }
  };

  const handleFilterChange = (val: string) => {
    setStatusFilter(val);
    setActiveFilter(val);
  };

  // Item management
  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...formItems];
    const item = { ...newItems[index] };
    if (field === "description") item.description = value as string;
    if (field === "quantity") item.quantity = parseInt(String(value), 10) || 0;
    if (field === "unit") item.unit = value as string;
    if (field === "unit_price") item.unit_price = parseInt(String(value), 10) || 0;
    item.amount = item.quantity * item.unit_price;
    newItems[index] = item;
    setFormItems(newItems);
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
          vehicle_id: formVehicleId || null,
          vehicle_info:
            formVehicleModel || formVehiclePlate || formVehicleVin
              ? { model: formVehicleModel, plate: formVehiclePlate, vin: formVehicleVin }
              : null,
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
      setFormVehicleId("");
      setFormVehicleModel("");
      setFormVehiclePlate("");
      setFormVehicleVin("");
      setSaveMsg({ text: `請求書 ${j.invoice?.invoice_number} を作成しました`, ok: true });
      mutate();
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
      mutate();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="請求書"
        title="請求書管理"
        description="請求書の作成・管理を行います。"
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
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {data && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.total}</div>
              <div className="mt-1 text-xs text-muted">総請求書数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">未入金</div>
              <div className="mt-2 text-2xl font-bold text-primary">{formatJpy(data.stats.unpaid_amount)}</div>
              <div className="mt-1 text-xs text-muted">未入金額</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">今月</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.this_month_issued}</div>
              <div className="mt-1 text-xs text-muted">今月発行</div>
            </div>
          </section>

          {/* Aging Analysis */}
          {(() => {
            const unpaid = data.invoices.filter((i) => i.status === "sent" || i.status === "overdue");
            if (unpaid.length === 0) return null;
            const now = new Date();
            const aging = { current: 0, d30: 0, d60: 0, d90: 0, currentAmt: 0, d30Amt: 0, d60Amt: 0, d90Amt: 0 };
            for (const inv of unpaid) {
              if (!inv.due_date) {
                aging.current++;
                aging.currentAmt += inv.total;
                continue;
              }
              const days = Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / 86400000);
              if (days <= 0) {
                aging.current++;
                aging.currentAmt += inv.total;
              } else if (days <= 30) {
                aging.d30++;
                aging.d30Amt += inv.total;
              } else if (days <= 60) {
                aging.d60++;
                aging.d60Amt += inv.total;
              } else {
                aging.d90++;
                aging.d90Amt += inv.total;
              }
            }
            return (
              <section className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                <div className="glass-card p-4">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-muted">期限内</div>
                  <div className="mt-1 text-lg font-bold text-primary">{formatJpy(aging.currentAmt)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{aging.current}件</div>
                </div>
                <div className="glass-card p-4">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-warning-text">30日超</div>
                  <div className="mt-1 text-lg font-bold text-warning-text">{formatJpy(aging.d30Amt)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{aging.d30}件</div>
                </div>
                <div className="glass-card p-4">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-danger-text">60日超</div>
                  <div className="mt-1 text-lg font-bold text-danger-text">{formatJpy(aging.d60Amt)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{aging.d60}件</div>
                </div>
                <div className="glass-card p-4">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-danger-text">90日超</div>
                  <div className="mt-1 text-lg font-bold text-danger-text">{formatJpy(aging.d90Amt)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{aging.d90}件</div>
                </div>
              </section>
            );
          })()}

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
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {saveMsg && (
            <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-red-500"}`}>{saveMsg.text}</div>
          )}

          {/* Create Form */}
          {showForm && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規作成</div>
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
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
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

              {/* Vehicle Info */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted tracking-[0.18em]">車両情報（任意）</div>
                {vehicles.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted">登録車両から選択</label>
                    <select
                      className="select-field"
                      value={formVehicleId}
                      onChange={(e) => handleVehicleSelect(e.target.value)}
                    >
                      <option value="">車両を選択...</option>
                      {vehicles.map((v) => {
                        const label = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ");
                        return (
                          <option key={v.id} value={v.id}>
                            {label || "（名称なし）"}
                            {v.plate_display ? `（${v.plate_display}）` : ""}
                            {v.customer_name ? ` — ${v.customer_name}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">車種</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Toyota Prius"
                      value={formVehicleModel}
                      onChange={(e) => setFormVehicleModel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">ナンバー</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="水戸 300 あ 12-34"
                      value={formVehiclePlate}
                      onChange={(e) => setFormVehiclePlate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted">車台番号</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      placeholder="VIN"
                      value={formVehicleVin}
                      onChange={(e) => setFormVehicleVin(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted tracking-[0.18em]">明細項目</div>
                {formItems.map((item, idx) => (
                  <div key={idx} className="space-y-1">
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
                    {certificates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-muted whitespace-nowrap">証明書紐付け:</label>
                        <select
                          className="select-field text-xs py-1"
                          value={item.certificate_id ?? ""}
                          onChange={(e) => linkCertificate(idx, e.target.value)}
                        >
                          <option value="">紐付けなし</option>
                          {certificates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.public_id} — {c.service_price != null ? formatJpy(c.service_price) : "料金未設定"} (
                              {c.status === "active" ? "有効" : c.status})
                            </option>
                          ))}
                        </select>
                        {item.certificate_id && <span className="text-[10px] text-success">✓ 紐付済</span>}
                      </div>
                    )}
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-end">
                      <div className="col-span-6 sm:col-span-4 space-y-1">
                        {idx === 0 && (
                          <label className="text-xs text-muted">内容（品目マスタから選択 or 直接入力）</label>
                        )}
                        <div className="relative">
                          <input
                            type="text"
                            className="input-field"
                            list={`menu-item-list-${idx}`}
                            placeholder="施工内容を入力 or 選択"
                            value={item.description}
                            onChange={(e) => {
                              updateItem(idx, "description", e.target.value);
                              // 品目マスタの名前と一致したら単価も自動入力
                              const matched = menuItems.find((m) => m.name === e.target.value);
                              if (matched) {
                                updateItem(idx, "unit_price", String(matched.unit_price ?? 0));
                              }
                            }}
                          />
                          <datalist id={`menu-item-list-${idx}`}>
                            {menuItems.map((m) => (
                              <option key={m.id} value={m.name}>
                                {m.name} — ¥{(m.unit_price ?? 0).toLocaleString()}
                              </option>
                            ))}
                          </datalist>
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-2 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">数量</label>}
                        <input
                          type="number"
                          className="input-field"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">単位</label>}
                        <input
                          type="text"
                          className="input-field"
                          list="unit-options"
                          value={item.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        />
                        {idx === 0 && (
                          <datalist id="unit-options">
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u} />
                            ))}
                          </datalist>
                        )}
                      </div>
                      <div className="col-span-2 sm:col-span-2 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">単価</label>}
                        <input
                          type="number"
                          className="input-field"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2 space-y-1">
                        {idx === 0 && <label className="text-xs text-muted">金額</label>}
                        <div className="input-field bg-transparent text-secondary cursor-default">
                          {item.amount.toLocaleString("ja-JP")}
                        </div>
                      </div>
                      <div className="col-span-6 sm:col-span-1">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs text-red-500"
                          onClick={() => removeItem(idx)}
                          disabled={formItems.length <= 1}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-ghost text-xs" onClick={addItem}>
                  + 明細を追加
                </button>
                {formCustomerId && certificates.length === 0 && (
                  <div className="text-[10px] text-muted">
                    ※ この顧客に紐付く証明書がないか、証明書データの取得中です
                  </div>
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
                  <input type="checkbox" checked={formShowSeal} onChange={(e) => setFormShowSeal(e.target.checked)} />
                  角印を表示
                </label>
                <label className="text-sm text-secondary cursor-pointer flex items-center gap-1.5">
                  <input type="checkbox" checked={formShowLogo} onChange={(e) => setFormShowLogo(e.target.checked)} />
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
                <button type="button" className="btn-primary" disabled={saving} onClick={handleCreate}>
                  {saving ? "作成中…" : "下書き作成"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowForm(false);
                    setFormItems([emptyItem()]);
                  }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Payment Dialog */}
          {paymentTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
              onClick={() => setPaymentTarget(null)}
            >
              <div
                className="mx-4 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold text-primary mb-3">入金を記録</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted">入金日</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setPaymentTarget(null)}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/admin/invoices", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: paymentTarget, status: "paid", payment_date: paymentDate }),
                        });
                        if (!res.ok) throw new Error("Failed");
                        setPaymentTarget(null);
                        mutate();
                      } catch (e: any) {
                        alert("入金記録に失敗しました: " + (e?.message ?? String(e)));
                      }
                    }}
                  >
                    入金確定
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Invoice List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">請求書一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">請求番号</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">顧客名</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      発行日
                    </th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      支払期限
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      ステータス
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {(data.invoices ?? []).map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          className="font-mono text-accent hover:text-accent/90 underline"
                        >
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-secondary">{inv.customer_name ?? "-"}</td>
                      <td className="hidden sm:table-cell px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(inv.issued_at)}
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-primary">
                        {inv.total != null ? formatJpy(inv.total) : "-"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={statusVariant(inv.status)}>{statusLabel(inv.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <Link href={`/admin/invoices/${inv.id}`} className="btn-ghost px-3 py-1 text-xs">
                            詳細
                          </Link>
                          {(inv.status === "sent" || inv.status === "overdue") && (
                            <button
                              type="button"
                              className="btn-primary px-3 py-1 text-xs"
                              onClick={() => {
                                setPaymentTarget(inv.id);
                                setPaymentDate(new Date().toISOString().slice(0, 10));
                              }}
                            >
                              入金
                            </button>
                          )}
                          {inv.status === "draft" && (
                            <button
                              type="button"
                              className="btn-danger px-3 py-1 text-xs"
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
