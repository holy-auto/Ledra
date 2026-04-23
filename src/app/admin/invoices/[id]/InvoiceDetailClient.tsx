"use client";

import { useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDate, formatDateTime, formatJpy } from "@/lib/format";

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
  status: string;
  issued_at: string | null;
  due_date: string | null;
  subtotal: number;
  tax: number;
  total: number;
  note: string | null;
  items_json: InvoiceItem[];
  created_at: string;
  updated_at: string | null;
  is_invoice_compliant?: boolean;
  show_seal?: boolean;
  show_logo?: boolean;
  show_bank_info?: boolean;
  recipient_name?: string | null;
  tax_rate?: number;
};

type BankInfo = {
  bank_name?: string | null;
  branch_name?: string | null;
  account_type?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
} | null;

type TenantInfo = {
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  registration_number: string | null;
  bank_info: BankInfo;
} | null;

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

const TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
};

export default function InvoiceDetailClient({
  invoice: initial,
  customerName,
  tenant,
}: {
  invoice: Invoice;
  customerName: string | null;
  tenant: TenantInfo;
}) {
  const [invoice, setInvoice] = useState(initial);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: invoice.id, status: newStatus }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setInvoice(j.invoice);
      setMsg({ text: `ステータスを「${statusLabel(newStatus)}」に変更しました`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setUpdating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const [downloading, setDownloading] = useState(false);
  const handlePdfDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/admin/invoices/pdf?id=${invoice.id}`);
      if (!res.ok) throw new Error(`PDF生成に失敗しました (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoice_number || "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setDownloading(false);
    }
  };

  const items = (invoice.items_json ?? []) as InvoiceItem[];
  const nextStatuses = TRANSITIONS[invoice.status] ?? [];

  return (
    <div className="space-y-6">
      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}

      {/* Status & Actions */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">ステータス:</span>
            <Badge variant={statusVariant(invoice.status)}>{statusLabel(invoice.status)}</Badge>
            {invoice.is_invoice_compliant && <Badge variant="info">インボイス対応</Badge>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {nextStatuses.map((ns) => (
              <button
                key={ns}
                type="button"
                className={ns === "cancelled" ? "btn-danger text-xs" : "btn-secondary text-xs"}
                disabled={updating}
                onClick={() => handleStatusChange(ns)}
              >
                {statusLabel(ns)}に変更
              </button>
            ))}
            <button type="button" className="btn-ghost text-xs" onClick={handlePrint}>
              印刷
            </button>
            <button type="button" className="btn-secondary text-xs" disabled={downloading} onClick={handlePdfDownload}>
              {downloading ? "生成中…" : "PDFダウンロード"}
            </button>
          </div>
        </div>
      </section>

      {/* Invoice Detail (print-friendly) */}
      <div ref={printRef} className="print-area">
        <section className="glass-card p-6 space-y-6 print:border-none print:shadow-none print:bg-white print:text-black">
          {/* Header */}
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary print:text-black">請求書</h2>
              <div className="text-sm text-muted print:text-gray-600 mt-1 font-mono">{invoice.invoice_number}</div>
              {invoice.is_invoice_compliant && tenant?.registration_number && (
                <div className="text-xs text-secondary print:text-gray-600 mt-1">
                  登録番号: {tenant.registration_number}
                </div>
              )}
            </div>
            <div className="text-right text-sm text-secondary print:text-gray-700 space-y-1">
              <div>発行日: {formatDate(invoice.issued_at)}</div>
              <div>支払期限: {formatDate(invoice.due_date)}</div>
            </div>
          </div>

          {/* Issuer / Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Customer (宛先) */}
            {(customerName || invoice.recipient_name) && (
              <div className="border-b border-border-subtle pb-4 print:border-gray-300">
                <div className="text-xs text-muted print:text-gray-500">宛先</div>
                <div className="text-lg font-semibold text-primary print:text-black mt-1">
                  {invoice.recipient_name || customerName} 様
                </div>
              </div>
            )}
            {/* Issuer (差出人) */}
            {tenant && (
              <div className="border-b border-border-subtle pb-4 print:border-gray-300">
                <div className="text-xs text-muted print:text-gray-500">差出人</div>
                <div className="text-sm text-primary print:text-black mt-1 space-y-0.5">
                  <div className="font-semibold">{tenant.name}</div>
                  {tenant.address && <div className="text-secondary print:text-gray-600">{tenant.address}</div>}
                  {tenant.contact_phone && (
                    <div className="text-secondary print:text-gray-600">TEL: {tenant.contact_phone}</div>
                  )}
                  {tenant.contact_email && (
                    <div className="text-secondary print:text-gray-600">{tenant.contact_email}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border-default print:border-gray-400">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">内容</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">数量</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">単価</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">金額</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-border-subtle print:border-gray-200">
                    <td className="py-3 px-3 text-primary print:text-black">
                      {item.description || "-"}
                      {item.certificate_public_id && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-accent-dim text-accent print:text-blue-600 print:bg-blue-50">
                          証明書: {item.certificate_public_id}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-secondary print:text-gray-700">{item.quantity}</td>
                    <td className="py-3 px-3 text-right text-secondary print:text-gray-700">
                      {formatJpy(item.unit_price)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-primary print:text-black">
                      {formatJpy(item.amount)}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">
                      明細がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm border-b border-border-subtle pb-2 print:border-gray-200">
                <span className="text-muted print:text-gray-500">小計</span>
                <span className="text-primary print:text-black">{formatJpy(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm border-b border-border-subtle pb-2 print:border-gray-200">
                <span className="text-muted print:text-gray-500">消費税（{invoice.tax_rate ?? 10}%）</span>
                <span className="text-primary print:text-black">{formatJpy(invoice.tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-1">
                <span className="text-primary print:text-black">合計</span>
                <span className="text-primary print:text-black">{formatJpy(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Seal & Logo area */}
          {(invoice.show_seal || invoice.show_logo) && (
            <div className="flex justify-end gap-6 pt-4">
              {invoice.show_logo && (
                <div className="text-xs text-muted print:text-gray-500 text-center">
                  <div className="w-16 h-16 border border-border-subtle rounded-lg flex items-center justify-center text-muted print:border-gray-300">
                    LOGO
                  </div>
                </div>
              )}
              {invoice.show_seal && (
                <div className="text-xs text-muted print:text-gray-500 text-center">
                  <div className="w-16 h-16 border border-dashed border-red-300 rounded-full flex items-center justify-center text-red-400 print:border-red-400">
                    印
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bank Info */}
          {invoice.show_bank_info && tenant?.bank_info && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300">
              <div className="text-xs font-semibold text-muted print:text-gray-500 mb-2">振込先口座情報</div>
              <div className="text-sm text-secondary print:text-gray-700 space-y-0.5">
                {tenant.bank_info.bank_name && (
                  <div>
                    {tenant.bank_info.bank_name}
                    {tenant.bank_info.branch_name ? ` ${tenant.bank_info.branch_name}` : ""}
                  </div>
                )}
                {tenant.bank_info.account_type && (
                  <div>
                    {tenant.bank_info.account_type} {tenant.bank_info.account_number ?? ""}
                  </div>
                )}
                {tenant.bank_info.account_holder && <div>口座名義: {tenant.bank_info.account_holder}</div>}
              </div>
            </div>
          )}

          {/* Note */}
          {invoice.note && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300">
              <div className="text-xs text-muted print:text-gray-500">備考</div>
              <div className="text-sm text-secondary print:text-gray-700 mt-1 whitespace-pre-wrap">{invoice.note}</div>
            </div>
          )}

          {/* Invoice compliance notice */}
          {invoice.is_invoice_compliant && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300 text-xs text-muted print:text-gray-500">
              ※ この書類は適格請求書等保存方式（インボイス制度）に対応しています。
            </div>
          )}
        </section>
      </div>

      {/* Meta */}
      <section className="glass-card p-5 text-xs text-muted space-y-1 print:hidden">
        <div>
          ID: <span className="font-mono">{invoice.id}</span>
        </div>
        <div>作成日: {formatDateTime(invoice.created_at)}</div>
        {invoice.updated_at && <div>更新日: {formatDateTime(invoice.updated_at)}</div>}
      </section>
    </div>
  );
}
