"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import ShareDocumentModal from "@/components/documents/ShareDocumentModal";
import { formatDate, formatDateTime, formatJpy } from "@/lib/format";
import {
  DOC_TYPES,
  STATUS_TRANSITIONS,
  statusLabel,
  statusVariant,
  type DocType,
  type DocumentItem,
  type DocumentRow,
} from "@/types/document";

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
  logo_asset_path: string | null;
  company_seal_path: string | null;
  bank_info: BankInfo;
} | null;

export default function DocumentDetailClient({
  document: initial,
  customerName,
  customerEmail,
  customerPhone,
  tenant,
}: {
  document: DocumentRow;
  customerName: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  tenant: TenantInfo;
}) {
  const [doc, setDoc] = useState(initial);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [converting, setConverting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: doc.id, status: newStatus }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDoc(j.document);
      setMsg({ text: `ステータスを「${statusLabel(newStatus)}」に変更しました`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!confirm("この書類を元に請求書を作成しますか？")) return;
    setConverting(true);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc_type: "invoice",
          customer_id: doc.customer_id,
          issued_at: new Date().toISOString().slice(0, 10),
          items: doc.items_json,
          tax_rate: doc.tax_rate,
          is_invoice_compliant: doc.is_invoice_compliant,
          show_seal: doc.show_seal,
          show_logo: doc.show_logo,
          source_document_id: doc.id,
          note: doc.note,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: `請求書 ${j.document?.doc_number} を作成しました`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setConverting(false);
    }
  };

  const handlePrint = () => window.print();

  const [downloading, setDownloading] = useState(false);
  const handlePdfDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/admin/documents/pdf?id=${doc.id}`);
      if (!res.ok) throw new Error(`PDF生成に失敗しました (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.doc_number || "document"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setDownloading(false);
    }
  };

  const items = (doc.items_json ?? []) as DocumentItem[];
  const nextStatuses = STATUS_TRANSITIONS[doc.status] ?? [];
  const docLabel = DOC_TYPES[doc.doc_type as DocType]?.label ?? doc.doc_type;
  const canConvert = doc.doc_type === "estimate" || doc.doc_type === "delivery";

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>
      )}

      {/* Status & Actions */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">ステータス:</span>
            <Badge variant={statusVariant(doc.status)}>
              {statusLabel(doc.status)}
            </Badge>
            {doc.is_invoice_compliant && (
              <Badge variant="info">インボイス対応</Badge>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {nextStatuses.map((ns) => (
              <button
                key={ns}
                type="button"
                className={ns === "cancelled" || ns === "rejected" ? "btn-danger text-xs" : "btn-secondary text-xs"}
                disabled={updating}
                onClick={() => handleStatusChange(ns)}
              >
                {statusLabel(ns)}に変更
              </button>
            ))}
            {canConvert && (
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={converting}
                onClick={handleConvertToInvoice}
              >
                {converting ? "変換中…" : "請求書に変換"}
              </button>
            )}
            <button type="button" className="btn-ghost text-xs" onClick={handlePrint}>
              印刷
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={downloading}
              onClick={handlePdfDownload}
            >
              {downloading ? "生成中…" : "PDFダウンロード"}
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => setShareOpen(true)}
            >
              共有
            </button>
          </div>
        </div>
      </section>

      {/* Document Detail (print-friendly) */}
      <div className="print-area">
        <section className="glass-card p-6 space-y-6 print:border-none print:shadow-none print:bg-white print:text-black">
          {/* Header */}
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary print:text-black">{docLabel}</h2>
              <div className="text-sm text-muted print:text-gray-600 mt-1 font-mono">
                {doc.doc_number}
              </div>
              {doc.is_invoice_compliant && tenant?.registration_number && (
                <div className="text-xs text-secondary print:text-gray-600 mt-1">
                  登録番号: {tenant.registration_number}
                </div>
              )}
            </div>
            <div className="text-right text-sm text-secondary print:text-gray-700 space-y-1">
              <div>発行日: {formatDate(doc.issued_at)}</div>
              {doc.due_date && <div>支払期限: {formatDate(doc.due_date)}</div>}
            </div>
          </div>

          {/* Issuer / Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Customer (宛先) */}
            {(customerName || doc.recipient_name) && (
              <div className="border-b border-border-subtle pb-4 print:border-gray-300">
                <div className="text-xs text-muted print:text-gray-500">宛先</div>
                <div className="text-lg font-semibold text-primary print:text-black mt-1">
                  {doc.recipient_name || customerName} 様
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
                  {tenant.contact_phone && <div className="text-secondary print:text-gray-600">TEL: {tenant.contact_phone}</div>}
                  {tenant.contact_email && <div className="text-secondary print:text-gray-600">{tenant.contact_email}</div>}
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
                      {item.tax_category === 8 && (
                        <span className="ml-1 text-[10px] text-muted">※軽減</span>
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
                <span className="text-primary print:text-black">{formatJpy(doc.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm border-b border-border-subtle pb-2 print:border-gray-200">
                <span className="text-muted print:text-gray-500">消費税（{doc.tax_rate}%）</span>
                <span className="text-primary print:text-black">{formatJpy(doc.tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-1">
                <span className="text-primary print:text-black">合計</span>
                <span className="text-primary print:text-black">{formatJpy(doc.total)}</span>
              </div>
            </div>
          </div>

          {/* Seal & Logo area */}
          {(doc.show_seal || doc.show_logo) && (
            <div className="flex justify-end gap-6 pt-4">
              {doc.show_logo && (
                <div className="text-xs text-muted print:text-gray-500 text-center">
                  {/* Logo placeholder — rendered from tenant.logo_asset_path when available */}
                  <div className="w-16 h-16 border border-border-subtle rounded-lg flex items-center justify-center text-muted print:border-gray-300">
                    LOGO
                  </div>
                </div>
              )}
              {doc.show_seal && (
                <div className="text-xs text-muted print:text-gray-500 text-center">
                  {/* Seal placeholder — rendered from tenant.company_seal_path when available */}
                  <div className="w-16 h-16 border border-dashed border-red-300 rounded-full flex items-center justify-center text-red-400 print:border-red-400">
                    印
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bank Info */}
          {doc.show_bank_info && tenant?.bank_info && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300">
              <div className="text-xs font-semibold text-muted print:text-gray-500 mb-2">振込先口座情報</div>
              <div className="text-sm text-secondary print:text-gray-700 space-y-0.5">
                {tenant.bank_info.bank_name && <div>{tenant.bank_info.bank_name}{tenant.bank_info.branch_name ? ` ${tenant.bank_info.branch_name}` : ""}</div>}
                {tenant.bank_info.account_type && <div>{tenant.bank_info.account_type} {tenant.bank_info.account_number ?? ""}</div>}
                {tenant.bank_info.account_holder && <div>口座名義: {tenant.bank_info.account_holder}</div>}
              </div>
            </div>
          )}

          {/* Note */}
          {doc.note && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300">
              <div className="text-xs text-muted print:text-gray-500">備考</div>
              <div className="text-sm text-secondary print:text-gray-700 mt-1 whitespace-pre-wrap">
                {doc.note}
              </div>
            </div>
          )}

          {/* Invoice compliance notice */}
          {doc.is_invoice_compliant && (
            <div className="border-t border-border-subtle pt-4 print:border-gray-300 text-xs text-muted print:text-gray-500">
              ※ この書類は適格請求書等保存方式（インボイス制度）に対応しています。
            </div>
          )}
        </section>
      </div>

      {/* Source document link */}
      {doc.source_document_id && (
        <section className="glass-card p-5 text-sm print:hidden">
          <span className="text-muted">元帳票: </span>
          <a
            href={`/admin/documents/${doc.source_document_id}`}
            className="text-accent hover:text-accent underline"
          >
            {doc.source_document_id}
          </a>
        </section>
      )}

      {/* Meta */}
      <section className="glass-card p-5 text-xs text-muted space-y-1 print:hidden">
        <div>ID: <span className="font-mono">{doc.id}</span></div>
        <div>作成日: {formatDateTime(doc.created_at)}</div>
        {doc.updated_at && <div>更新日: {formatDateTime(doc.updated_at)}</div>}
      </section>

      {/* Share Modal */}
      <ShareDocumentModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        document={doc}
        customerName={customerName}
        customerEmail={customerEmail}
        customerPhone={customerPhone}
        onShared={(channel) => {
          if (doc.status === "draft") {
            setDoc((prev) => ({ ...prev, status: "sent" }));
          }
          setMsg({ text: `${channel}で送信しました`, ok: true });
        }}
      />
    </div>
  );
}
