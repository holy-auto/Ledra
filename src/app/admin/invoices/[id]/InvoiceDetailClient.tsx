"use client";

import { useRef, useState } from "react";
import Badge from "@/components/ui/Badge";

type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
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
};

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

const TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
};

export default function InvoiceDetailClient({
  invoice: initial,
  customerName,
}: {
  invoice: Invoice;
  customerName: string | null;
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
      const j = await res.json().catch(() => null);
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

  const items = (invoice.items_json ?? []) as InvoiceItem[];
  const nextStatuses = TRANSITIONS[invoice.status] ?? [];

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>
      )}

      {/* Status & Actions */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">ステータス:</span>
            <Badge variant={statusVariant(invoice.status)}>
              {statusLabel(invoice.status)}
            </Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            {nextStatuses.map((ns) => (
              <button
                key={ns}
                type="button"
                className={ns === "cancelled" ? "btn-danger !text-xs" : "btn-secondary !text-xs"}
                disabled={updating}
                onClick={() => handleStatusChange(ns)}
              >
                {statusLabel(ns)}に変更
              </button>
            ))}
            <button type="button" className="btn-ghost !text-xs" onClick={handlePrint}>
              印刷
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
              <div className="text-sm text-muted print:text-gray-600 mt-1 font-mono">
                {invoice.invoice_number}
              </div>
            </div>
            <div className="text-right text-sm text-secondary print:text-gray-700 space-y-1">
              <div>発行日: {invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString("ja-JP") : "-"}</div>
              <div>支払期限: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("ja-JP") : "-"}</div>
            </div>
          </div>

          {/* Customer */}
          {customerName && (
            <div className="border-b border-border-subtle pb-4 print:border-gray-300">
              <div className="text-xs text-muted print:text-gray-500">請求先</div>
              <div className="text-lg font-semibold text-primary print:text-black mt-1">
                {customerName} 様
              </div>
            </div>
          )}

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
                    <td className="py-3 px-3 text-primary print:text-black">{item.description || "-"}</td>
                    <td className="py-3 px-3 text-right text-secondary print:text-gray-700">{item.quantity}</td>
                    <td className="py-3 px-3 text-right text-secondary print:text-gray-700">
                      {item.unit_price.toLocaleString("ja-JP")}円
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-primary print:text-black">
                      {item.amount.toLocaleString("ja-JP")}円
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">明細がありません</td>
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
                <span className="text-primary print:text-black">{invoice.subtotal.toLocaleString("ja-JP")}円</span>
              </div>
              <div className="flex justify-between text-sm border-b border-border-subtle pb-2 print:border-gray-200">
                <span className="text-muted print:text-gray-500">消費税（10%）</span>
                <span className="text-primary print:text-black">{invoice.tax.toLocaleString("ja-JP")}円</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-1">
                <span className="text-primary print:text-black">合計</span>
                <span className="text-primary print:text-black">{invoice.total.toLocaleString("ja-JP")}円</span>
              </div>
            </div>
          </div>

          {/* Note */}
          {invoice.note && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300">
              <div className="text-xs text-muted print:text-gray-500">備考</div>
              <div className="text-sm text-secondary print:text-gray-700 mt-1 whitespace-pre-wrap">
                {invoice.note}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Meta */}
      <section className="glass-card p-5 text-xs text-muted space-y-1 print:hidden">
        <div>ID: <span className="font-mono">{invoice.id}</span></div>
        <div>作成日: {new Date(invoice.created_at).toLocaleString("ja-JP")}</div>
        {invoice.updated_at && (
          <div>更新日: {new Date(invoice.updated_at).toLocaleString("ja-JP")}</div>
        )}
      </section>
    </div>
  );
}
