"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatJpy } from "@/lib/format";
import { calcSellingPrice } from "@/lib/pricing/margin";
import { DOC_TYPES, DOC_TYPE_LIST, type DocType, type DocumentItem, type DocumentRow } from "@/types/document";
import QuoteAiDraftPanel from "./QuoteAiDraftPanel";
import ItemCodeField from "@/components/documents/ItemCodeField";

type Customer = {
  id: string;
  name: string;
  honorific: "御中" | "様" | "" | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  billing_cycle: "per_job" | "consolidated" | null;
  billing_terms_note: string | null;
};
type MenuItem = {
  id: string;
  name: string;
  item_code: string | null;
  description: string | null;
  unit_price: number;
  cost_price: number | null;
  margin_rate: number | null;
  tax_category: number;
};

const BILLING_CYCLE_LABEL: Record<string, string> = { per_job: "都度払い", consolidated: "合算（締め払い）" };
type TemplateOption = { id: string; name: string; doc_type: string | null };

const emptyItem = (): DocumentItem => ({
  item_type: "item",
  description: "",
  quantity: 1,
  unit: "式",
  unit_price: 0,
  amount: 0,
});

/** items 配列を走査し、小計行の amount を直前の小計行（または先頭）からの item 累積で算出する */
const recalcSubtotals = (items: DocumentItem[]): DocumentItem[] => {
  let running = 0;
  return items.map((it) => {
    const type = it.item_type ?? "item";
    if (type === "heading") {
      return { ...it, quantity: 0, unit_price: 0, amount: 0 };
    }
    if (type === "subtotal") {
      const amount = running;
      running = 0;
      return { ...it, quantity: 0, unit_price: 0, amount };
    }
    running += it.amount;
    return it;
  });
};

export type DocumentFormProps = {
  /** "create" は POST、"edit" は PUT */
  mode: "create" | "edit";
  /** edit モード時の初期値 */
  initial?: DocumentRow;
  /** create モード時のデフォルト doc_type */
  defaultDocType?: DocType;
  /** create モード時の顧客 ID プリフィル */
  prefillCustomerId?: string;
  /** 保存成功時 */
  onSaved: (document: DocumentRow) => void;
  /** キャンセル時 */
  onCancel: () => void;
};

export default function DocumentForm({
  mode,
  initial,
  defaultDocType,
  prefillCustomerId,
  onSaved,
  onCancel,
}: DocumentFormProps) {
  const isEdit = mode === "edit";

  // 初期値はモードに応じて算出（edit は initial から、create はデフォルト値）
  const initialItems = (initial?.items_json as DocumentItem[] | undefined) ?? [emptyItem()];
  const initialIsTaxInclusive = (initial?.meta_json as Record<string, unknown> | undefined)?.is_tax_inclusive === true;

  const [formDocType, setFormDocType] = useState<DocType>(
    (initial?.doc_type as DocType) ?? defaultDocType ?? "estimate",
  );
  const [formCustomerId, setFormCustomerId] = useState(initial?.customer_id ?? "");
  const [formRecipientName, setFormRecipientName] = useState(initial?.recipient_name ?? "");
  const [formRecipientHonorific, setFormRecipientHonorific] = useState<"御中" | "様" | "">(
    (initial?.recipient_honorific as "御中" | "様" | "") ?? "御中",
  );
  const [formRecipientPostalCode, setFormRecipientPostalCode] = useState(initial?.recipient_postal_code ?? "");
  const [formRecipientAddress, setFormRecipientAddress] = useState(initial?.recipient_address ?? "");
  const [formRecipientPhone, setFormRecipientPhone] = useState(initial?.recipient_phone ?? "");
  const [formSubject, setFormSubject] = useState(initial?.subject ?? "");
  const [formPeriodStart, setFormPeriodStart] = useState(initial?.period_start ?? "");
  const [formPeriodEnd, setFormPeriodEnd] = useState(initial?.period_end ?? "");
  const [formPaymentTerms, setFormPaymentTerms] = useState(initial?.payment_terms ?? "");
  const [formDeliveryDate, setFormDeliveryDate] = useState(initial?.delivery_date ?? "");
  const [formTemplateId, setFormTemplateId] = useState<string>(initial?.template_id ?? "");
  const [formIssuedAt, setFormIssuedAt] = useState(initial?.issued_at ?? new Date().toISOString().slice(0, 10));
  const [formDueDate, setFormDueDate] = useState(initial?.due_date ?? "");
  const [formNote, setFormNote] = useState(initial?.note ?? "");
  const [formItems, setFormItems] = useState<DocumentItem[]>(initialItems);
  const [formTaxRate, setFormTaxRate] = useState(initial?.tax_rate ?? 10);
  const [formIsTaxInclusive, setFormIsTaxInclusive] = useState(initialIsTaxInclusive);
  const [formInvoiceCompliant, setFormInvoiceCompliant] = useState(initial?.is_invoice_compliant ?? false);
  const [formShowSeal, setFormShowSeal] = useState(initial?.show_seal ?? false);
  const [formShowLogo, setFormShowLogo] = useState(initial?.show_logo ?? true);
  const [formShowBankInfo, setFormShowBankInfo] = useState(initial?.show_bank_info ?? false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Drag & Drop
  const [dragHandleHeld, setDragHandleHeld] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragSrcIdx = useRef<number | null>(null);

  // Reference data fetch
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.customers) {
        setCustomers(
          j.customers.map((c: any) => ({
            id: c.id,
            name: c.name,
            honorific: c.honorific ?? null,
            postal_code: c.postal_code ?? null,
            address: c.address ?? null,
            phone: c.phone ?? null,
            billing_cycle: c.billing_cycle ?? null,
            billing_terms_note: c.billing_terms_note ?? null,
          })),
        );
      }
    } catch {}
  }, []);

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/menu-items?active_only=true", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.items) {
        setMenuItems(
          j.items.map((m: any) => ({
            id: m.id,
            name: m.name,
            item_code: m.item_code ?? null,
            description: m.description,
            unit_price: m.unit_price,
            cost_price: m.cost_price ?? null,
            margin_rate: m.margin_rate ?? null,
            tax_category: m.tax_category,
          })),
        );
      }
    } catch {}
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/document-templates", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.templates) {
        setTemplates(j.templates.map((t: any) => ({ id: t.id, name: t.name, doc_type: t.doc_type })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchCustomers(), fetchMenuItems(), fetchTemplates()]);
  }, [fetchCustomers, fetchMenuItems, fetchTemplates]);

  // create モードで URL プリフィル
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (isEdit) return;
    if (prefillAppliedRef.current) return;
    if (!prefillCustomerId) return;
    if (customers.length === 0) return;
    setFormCustomerId(prefillCustomerId);
    prefillAppliedRef.current = true;
  }, [customers, prefillCustomerId, isEdit]);

  // ─── Item management ───
  const updateItem = (index: number, field: keyof DocumentItem, value: string | number | null) => {
    // 同一レンダー内で updateItem が連続呼び出しされても取りこぼさないよう関数型更新にする
    setFormItems((prev) => {
      const newItems = [...prev];
      const item = { ...newItems[index] };
      if (field === "description") item.description = value as string;
      if (field === "item_code") item.item_code = (value as string) || null;
      if (field === "unit") item.unit = (value as string) ?? "";
      if (field === "quantity") {
        // 表示は入力中の生文字列を保持する。quantity（パース後の数値）から
        // 都度作り直すと、"0" や末尾の "0." のような入力途中の表記が
        // 再描画のたびに消えてしまう。
        item._quantity_text = value as string;
        item.quantity = parseFloat(String(value)) || 0;
      }
      if (field === "unit_price") item.unit_price = parseInt(String(value), 10) || 0;
      if (field === "cost_price") {
        const v = value === "" || value == null ? 0 : parseInt(String(value), 10) || 0;
        item.cost_price = v;
        if (item.margin_rate != null) {
          item.unit_price = calcSellingPrice(v, item.margin_rate);
        }
      }
      if (field === "margin_rate") {
        const v = value === "" || value == null ? null : parseFloat(String(value));
        item.margin_rate = v == null || isNaN(v) ? null : v;
        if (item.cost_price != null && item.margin_rate != null) {
          item.unit_price = calcSellingPrice(item.cost_price, item.margin_rate);
        }
      }
      const type = item.item_type ?? "item";
      if (type === "item") {
        item.amount = Math.round(item.quantity * item.unit_price);
      }
      newItems[index] = item;
      return recalcSubtotals(newItems);
    });
  };

  const addItem = () => setFormItems(recalcSubtotals([...formItems, emptyItem()]));
  const removeItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(recalcSubtotals(formItems.filter((_, i) => i !== index)));
  };

  const changeItemType = (index: number, newType: "item" | "heading" | "subtotal") => {
    const newItems = [...formItems];
    const item = { ...newItems[index] };
    item.item_type = newType;
    // 行タイプ変更で quantity を作り直すため、入力中テキストの残骸を破棄する
    delete item._quantity_text;
    if (newType === "heading") {
      item.quantity = 0;
      item.unit_price = 0;
      item.amount = 0;
    } else if (newType === "subtotal") {
      item.quantity = 0;
      item.unit_price = 0;
      item.amount = 0;
      if (!item.description) item.description = "小計";
    } else {
      if (!item.quantity) item.quantity = 1;
      item.amount = Math.round(item.quantity * item.unit_price);
    }
    newItems[index] = item;
    setFormItems(recalcSubtotals(newItems));
  };

  const handleMenuItemSelect = (menuItemId: string, itemIndex: number) => {
    const mi = menuItems.find((m) => m.id === menuItemId);
    if (!mi) return;
    const newItems = [...formItems];
    const item = { ...newItems[itemIndex] };
    item.item_code = mi.item_code ?? null;
    item.description = mi.name + (mi.description ? ` (${mi.description})` : "");
    item.unit_price = mi.unit_price;
    if (mi.cost_price != null) item.cost_price = mi.cost_price;
    if (mi.margin_rate != null) item.margin_rate = mi.margin_rate;
    item.amount = Math.round(item.quantity * item.unit_price);
    newItems[itemIndex] = item;
    setFormItems(recalcSubtotals(newItems));
  };

  // ─── DnD ───
  const handleRowDragStart = (idx: number) => (e: React.DragEvent) => {
    dragSrcIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const handleRowDragOver = (idx: number) => (e: React.DragEvent) => {
    if (dragSrcIdx.current == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };
  const handleRowDragLeave = (idx: number) => () => {
    if (dragOverIdx === idx) setDragOverIdx(null);
  };
  const handleRowDrop = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSrcIdx.current;
    if (src == null || src === targetIdx) {
      setDragOverIdx(null);
      setDragHandleHeld(null);
      dragSrcIdx.current = null;
      return;
    }
    setFormItems((items) => {
      const next = [...items];
      const [moved] = next.splice(src, 1);
      const adjusted = targetIdx > src ? targetIdx - 1 : targetIdx;
      next.splice(adjusted, 0, moved);
      return recalcSubtotals(next);
    });
    setDragOverIdx(null);
    setDragHandleHeld(null);
    dragSrcIdx.current = null;
  };
  const handleRowDragEnd = () => {
    setDragOverIdx(null);
    setDragHandleHeld(null);
    dragSrcIdx.current = null;
  };

  // ─── Totals ───
  const itemsSum = formItems.filter((i) => (i.item_type ?? "item") === "item").reduce((s, i) => s + i.amount, 0);
  const { subtotal, tax, total } = formIsTaxInclusive
    ? (() => {
        const sub = Math.round(itemsSum / (1 + formTaxRate / 100));
        return { subtotal: sub, tax: itemsSum - sub, total: itemsSum };
      })()
    : (() => {
        const t = Math.floor(itemsSum * (formTaxRate / 100));
        return { subtotal: itemsSum, tax: t, total: itemsSum + t };
      })();

  // ─── Submit ───
  const handleSubmit = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: Record<string, unknown> = {
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
        is_tax_inclusive: formIsTaxInclusive,
        is_invoice_compliant: formInvoiceCompliant,
        show_seal: formShowSeal,
        show_logo: formShowLogo,
        show_bank_info: formShowBankInfo,
      };
      if (isEdit && initial) payload.id = initial.id;

      const res = await fetch("/api/admin/documents", {
        method: isEdit ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      onSaved(j.document as DocumentRow);
    } catch (e: any) {
      setSaveMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card p-5 space-y-4">
      {!isEdit && formDocType === "estimate" && (
        <QuoteAiDraftPanel
          customerId={formCustomerId || undefined}
          onApply={(items, terms) => {
            const next = items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              unit: "式",
              unit_price: it.unit_price,
              amount: Math.round(it.quantity * it.unit_price),
              is_reduced_rate: false,
              tax_rate: null,
              certificate_id: null,
              certificate_public_id: null,
            }));
            setFormItems(recalcSubtotals(next as unknown as DocumentItem[]));
            if (terms) setFormNote(terms);
          }}
        />
      )}

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">{isEdit ? "編集" : "新規作成"}</div>
        <div className="mt-1 text-base font-semibold text-primary">
          {isEdit ? `${DOC_TYPES[formDocType]?.label ?? formDocType}を編集` : "新規帳票作成"}
        </div>
      </div>

      {saveMsg && <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>{saveMsg.text}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-muted">書類種別</label>
          <select
            className="select-field"
            value={formDocType}
            onChange={(e) => setFormDocType(e.target.value as DocType)}
            disabled={isEdit}
            title={isEdit ? "編集中は書類種別を変更できません" : ""}
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
              const id = e.target.value;
              setFormCustomerId(id);
              if (!id) return;
              setFormRecipientName("");
              // 顧客管理に登録済みの敬称・住所・支払条件を宛先詳細へ自動反映する。
              // 編集モードでは既に手入力・確定済みの宛先情報を上書きしないよう、
              // 新規作成時のみ自動反映する。
              if (isEdit) return;
              const c = customers.find((cust) => cust.id === id);
              if (c) {
                setFormRecipientHonorific(c.honorific || "御中");
                setFormRecipientPostalCode(c.postal_code ?? "");
                setFormRecipientAddress(c.address ?? "");
                setFormRecipientPhone(c.phone ?? "");
                setFormPaymentTerms(
                  c.billing_terms_note || (c.billing_cycle ? BILLING_CYCLE_LABEL[c.billing_cycle] : ""),
                );
              }
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
          <input
            type="text"
            className="input-field"
            placeholder={isEdit ? "" : "自動生成"}
            value={initial?.doc_number ?? ""}
            disabled
          />
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
        <div className="space-y-1">
          <label className="text-xs text-muted">単価の入力方式</label>
          <select
            className="select-field"
            value={formIsTaxInclusive ? "inclusive" : "exclusive"}
            onChange={(e) => setFormIsTaxInclusive(e.target.value === "inclusive")}
          >
            <option value="exclusive">税抜表示（外税）</option>
            <option value="inclusive">税込表示（内税）</option>
          </select>
        </div>
      </div>

      {/* 宛先詳細 & 案件情報 */}
      <div className="border-t border-border-subtle pt-4 space-y-3">
        <div className="text-xs font-semibold text-muted tracking-[0.18em]">宛先詳細・案件情報（帳票に表示）</div>
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
          <select className="select-field" value={formTemplateId} onChange={(e) => setFormTemplateId(e.target.value)}>
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
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold text-muted tracking-[0.18em]">明細項目</div>
          <div className="text-[11px] text-muted">{formIsTaxInclusive ? "単価は税込で入力" : "単価は税抜で入力"}</div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[960px] space-y-1">
            {/* Header labels */}
            <div className="grid grid-cols-[28px_96px_minmax(0,1fr)_64px_60px_88px_72px_96px_104px_56px] gap-2 px-1">
              <span />
              <label className="text-xs text-muted">行タイプ</label>
              <label className="text-xs text-muted">内容</label>
              <label className="text-xs text-muted">数量</label>
              <label className="text-xs text-muted">単位</label>
              <label className="text-xs text-muted">原価</label>
              <label className="text-xs text-muted">利益率%</label>
              <label className="text-xs text-muted">単価</label>
              <label className="text-xs text-muted text-right">金額</label>
              <span />
            </div>
            {formItems.map((item, idx) => {
              const type = item.item_type ?? "item";
              const isDragOver = dragOverIdx === idx;
              const isDragging = dragSrcIdx.current === idx;
              return (
                <div
                  key={idx}
                  draggable={dragHandleHeld === idx}
                  onDragStart={handleRowDragStart(idx)}
                  onDragOver={handleRowDragOver(idx)}
                  onDragLeave={handleRowDragLeave(idx)}
                  onDrop={handleRowDrop(idx)}
                  onDragEnd={handleRowDragEnd}
                  className={`grid grid-cols-[28px_96px_minmax(0,1fr)_64px_60px_88px_72px_96px_104px_56px] gap-2 items-start rounded transition-colors ${
                    isDragOver ? "ring-2 ring-accent bg-accent/5" : ""
                  } ${isDragging ? "opacity-40" : ""}`}
                >
                  {/* ドラッグハンドル */}
                  <button
                    type="button"
                    onMouseDown={() => setDragHandleHeld(idx)}
                    onMouseUp={() => setDragHandleHeld(null)}
                    onMouseLeave={() => {
                      if (dragSrcIdx.current == null) setDragHandleHeld(null);
                    }}
                    onTouchStart={() => setDragHandleHeld(idx)}
                    onTouchEnd={() => setDragHandleHeld(null)}
                    className="self-center text-muted hover:text-primary cursor-grab active:cursor-grabbing select-none text-base leading-none"
                    title="ドラッグして並び替え"
                    aria-label="ドラッグして並び替え"
                  >
                    ≡
                  </button>
                  {/* 行タイプセレクター */}
                  <select
                    className="select-field py-1.5 text-xs"
                    value={type}
                    onChange={(e) => changeItemType(idx, e.target.value as "item" | "heading" | "subtotal")}
                    aria-label="行タイプ"
                  >
                    <option value="item">通常</option>
                    <option value="heading">見出し行</option>
                    <option value="subtotal">小計行</option>
                  </select>

                  {/* 内容 */}
                  {type === "heading" ? (
                    <input
                      type="text"
                      className="input-field font-semibold"
                      style={{ gridColumn: "span 6 / span 6" }}
                      placeholder="例：部品代、作業費 など"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                  ) : type === "subtotal" ? (
                    <>
                      <input
                        type="text"
                        className="input-field"
                        style={{ gridColumn: "span 5 / span 5" }}
                        placeholder="小計"
                        value={item.description}
                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                      />
                      <div className="input-field bg-transparent text-secondary cursor-default text-right font-semibold">
                        {item.amount.toLocaleString("ja-JP")}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0">
                        {menuItems.length > 0 && (
                          <div className="mb-1">
                            <ItemCodeField
                              value={item.item_code ?? ""}
                              menuItems={menuItems}
                              onChange={(code) => updateItem(idx, "item_code", code)}
                              onSelect={(mi) => handleMenuItemSelect(mi.id, idx)}
                            />
                          </div>
                        )}
                        {menuItems.length > 0 && (
                          <select
                            className="select-field py-1 text-xs mb-1 w-full"
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
                      <input
                        type="number"
                        className="input-field"
                        min="0"
                        step="0.1"
                        placeholder="1"
                        value={item._quantity_text ?? String(item.quantity)}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="式"
                        value={item.unit ?? ""}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      />
                      <input
                        type="number"
                        className="input-field"
                        min="0"
                        placeholder="0"
                        value={item.cost_price || ""}
                        onChange={(e) => updateItem(idx, "cost_price", e.target.value)}
                        title="原価（仕入値）。利益率と組み合わせて単価を自動算出。"
                      />
                      <input
                        type="number"
                        className="input-field"
                        step="0.01"
                        placeholder="30"
                        value={item.margin_rate ?? ""}
                        onChange={(e) => updateItem(idx, "margin_rate", e.target.value)}
                        title="利益率%。原価×(1+利益率%) で単価を自動算出。"
                      />
                      <input
                        type="number"
                        className={`input-field ${
                          (item.cost_price ?? 0) > 0 && item.margin_rate != null ? "text-accent" : ""
                        }`}
                        min="0"
                        placeholder="0"
                        value={item.unit_price || ""}
                        onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        title={
                          (item.cost_price ?? 0) > 0 && item.margin_rate != null
                            ? "原価と利益率から自動算出（手動で上書き可）"
                            : "提供価格（単価）"
                        }
                      />
                      <div className="input-field bg-transparent text-secondary cursor-default text-right">
                        {item.amount.toLocaleString("ja-JP")}
                      </div>
                    </>
                  )}

                  {/* 削除ボタン */}
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs text-danger self-start"
                    onClick={() => removeItem(idx)}
                    disabled={formItems.length <= 1}
                    title="この行を削除"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={addItem}>
          + 行追加
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
        <textarea className="input-field" rows={2} value={formNote} onChange={(e) => setFormNote(e.target.value)} />
      </div>

      <div className="flex gap-3">
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSubmit}>
          {saving ? "保存中…" : isEdit ? "保存" : "下書き作成"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </section>
  );
}
