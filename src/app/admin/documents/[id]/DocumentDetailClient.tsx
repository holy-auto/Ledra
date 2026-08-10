"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState } from "react";
import useSWR from "swr";
import Badge from "@/components/ui/Badge";
import ShareDocumentModal from "@/components/documents/ShareDocumentModal";
import { fetcher, adminSwrConfig } from "@/lib/swr";
import { formatDate, formatDateTime, formatJpy } from "@/lib/format";
import { itemContentLines } from "@/lib/documents/itemDisplay";
import {
  CONVERSION_TARGETS,
  DOC_TYPES,
  isDocumentEditable,
  nextStatusesFor,
  statusLabel,
  statusVariant,
  type DocType,
  type DocumentItem,
  type DocumentRow,
} from "@/types/document";
import { describeIntegritySeal } from "@/lib/documents/integritySealView";
import DocumentForm from "../DocumentForm";

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

type ShareLogEntry = {
  id: string;
  channel: "email" | "line" | "sms";
  recipient: string;
  sent_at: string;
  status: string | null;
  error_message: string | null;
};

const CHANNEL_LABELS: Record<string, string> = { email: "メール", line: "LINE", sms: "SMS" };

export default function DocumentDetailClient({
  document: initial,
  customerName,
  customerEmail,
  customerPhone,
  tenant,
  logoUrl,
  sealUrl,
  canSendLinePayment = false,
  customerHasLine = false,
}: {
  document: DocumentRow;
  customerName: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  tenant: TenantInfo;
  logoUrl?: string | null;
  sealUrl?: string | null;
  /** LINE 決済リンク送信の可否（請求書のみ。Stripe Connect オンボーディング済 + LINE 連携済） */
  canSendLinePayment?: boolean;
  /** 顧客に LINE ユーザが紐付いているか（ボタンの無効化理由表示に使う） */
  customerHasLine?: boolean;
}) {
  const [doc, setDoc] = useState(initial);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [converting, setConverting] = useState<DocType | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [paymentDateInput, setPaymentDateInput] = useState<string | null>(null);
  const [linePayBusy, setLinePayBusy] = useState(false);
  const [linePayUrl, setLinePayUrl] = useState<string | null>(null);

  // 送付履歴（document_share_log）。共有直後に mutate で最新化する。
  const {
    data: shareData,
    error: shareError,
    mutate: mutateShares,
  } = useSWR<{ shares: ShareLogEntry[] }>(`/api/admin/documents/share?document_id=${doc.id}`, fetcher, adminSwrConfig);
  const shares = shareData?.shares ?? [];

  const handleStatusChange = async (newStatus: string, paymentDate?: string) => {
    setUpdating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          status: newStatus,
          ...(paymentDate ? { payment_date: paymentDate } : {}),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDoc(j.document);
      setPaymentDateInput(null);
      setMsg({ text: `ステータスを「${statusLabel(newStatus)}」に変更しました`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleSendLinePaymentLink = async () => {
    if (!canSendLinePayment) return;
    if (
      !confirm(
        `LINE で決済リンクを送信します。\n金額: ¥${doc.total.toLocaleString("ja-JP")}\n${customerName ?? doc.recipient_name ?? "お客様"} 様に送ってよろしいですか？`,
      )
    ) {
      return;
    }
    setLinePayBusy(true);
    setMsg(null);
    setLinePayUrl(null);
    try {
      const res = await fetch(`/api/admin/invoices/${doc.id}/send-line-payment-link`, { method: "POST" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      const url = j?.checkout_url as string | undefined;
      if (url) setLinePayUrl(url);
      if (j?.delivered === false) {
        setMsg({
          text: "決済リンクを生成しましたが、LINE 配信に失敗しました。下に表示された URL をコピーして他の手段で送付してください。",
          ok: false,
        });
      } else {
        setMsg({ text: "LINE に決済リンクを送信しました。顧客の入金をお待ちください。", ok: true });
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setLinePayBusy(false);
    }
  };

  const handleConvertTo = async (targetDocType: DocType) => {
    const targetLabel = DOC_TYPES[targetDocType]?.label ?? targetDocType;
    if (!confirm(`この書類を元に${targetLabel}を作成しますか？`)) return;
    setConverting(targetDocType);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc_type: targetDocType,
          customer_id: doc.customer_id,
          // 顧客未紐付け (recipient_* を直接持つ) の伝票でも宛先を失わないよう引き継ぐ。
          // 例: 中古車商談から作成した見積 (customer_id なし・宛名は buyer)。
          recipient_name: doc.recipient_name,
          recipient_honorific: doc.recipient_honorific,
          recipient_postal_code: doc.recipient_postal_code,
          recipient_address: doc.recipient_address,
          recipient_phone: doc.recipient_phone,
          subject: doc.subject,
          issued_at: new Date().toISOString().slice(0, 10),
          items: doc.items_json,
          tax_rate: doc.tax_rate,
          is_invoice_compliant: doc.is_invoice_compliant,
          show_seal: doc.show_seal,
          show_logo: doc.show_logo,
          vehicle_id: doc.vehicle_id,
          vehicle_info: doc.vehicle_info_json,
          source_document_id: doc.id,
          note: doc.note,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: `${targetLabel} ${j.document?.doc_number} を作成しました`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setConverting(null);
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

  const seal = describeIntegritySeal(doc.meta_json);
  const items = (doc.items_json ?? []) as DocumentItem[];
  const nextStatuses = nextStatusesFor(doc.doc_type, doc.status);
  const docLabel = DOC_TYPES[doc.doc_type as DocType]?.label ?? doc.doc_type;
  const conversionTargets = CONVERSION_TARGETS[doc.doc_type as DocType] ?? [];
  const canEdit = isDocumentEditable(doc.doc_type, doc.status);
  // 入金記録・LINE決済リンクは請求書・合算請求書のみ対象（サーバ側 send-line-payment-link /
  // documents PUT の売掛元帳記帳も同じ2種類を対象にしている）
  const isInvoice = doc.doc_type === "invoice" || doc.doc_type === "consolidated_invoice";

  return (
    <div className="space-y-6">
      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}

      {/* Status & Actions */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">ステータス:</span>
            <Badge variant={statusVariant(doc.status)}>{statusLabel(doc.status)}</Badge>
            {doc.is_invoice_compliant && <Badge variant="info">インボイス対応</Badge>}
            {seal && (
              <span className="inline-flex items-center gap-1" title={seal.detail ?? undefined}>
                <Badge variant={seal.hasTimestamp ? "success" : "info"}>🔏 {seal.label}</Badge>
                {seal.detail && <span className="text-xs text-muted">{seal.detail}</span>}
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {canEdit && !editing && (
              <button type="button" className="btn-primary text-xs" onClick={() => setEditing(true)}>
                編集
              </button>
            )}
            {nextStatuses.map((ns) => (
              <button
                key={ns}
                type="button"
                className={ns === "cancelled" || ns === "rejected" ? "btn-danger text-xs" : "btn-secondary text-xs"}
                disabled={updating}
                onClick={() => {
                  // 請求書の「入金済」は入金日を記録するため、直接変更せず日付ピッカーを開く
                  if (isInvoice && ns === "paid") {
                    setPaymentDateInput(new Date().toISOString().slice(0, 10));
                    return;
                  }
                  handleStatusChange(ns);
                }}
              >
                {statusLabel(ns)}に変更
              </button>
            ))}
            {conversionTargets.map((target) => (
              <button
                key={target}
                type="button"
                className="btn-secondary text-xs"
                disabled={converting !== null}
                onClick={() => handleConvertTo(target)}
              >
                {converting === target ? "変換中…" : `${DOC_TYPES[target].label}に変換`}
              </button>
            ))}
            <button type="button" className="btn-ghost text-xs" onClick={handlePrint}>
              印刷
            </button>
            <button type="button" className="btn-secondary text-xs" disabled={downloading} onClick={handlePdfDownload}>
              {downloading ? "生成中…" : "PDFダウンロード"}
            </button>
            <button type="button" className="btn-primary text-xs" onClick={() => setShareOpen(true)}>
              共有
            </button>
            {isInvoice && doc.status !== "paid" && doc.status !== "cancelled" && (
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={!canSendLinePayment || linePayBusy}
                onClick={handleSendLinePaymentLink}
                title={
                  canSendLinePayment
                    ? "LINE で決済リンクを送信"
                    : customerHasLine
                      ? "Stripe Connect オンボーディング / LINE 連携を確認してください"
                      : "顧客に LINE ユーザが紐付いていません"
                }
              >
                {linePayBusy ? "送信中…" : "💚 LINE で決済リンクを送る"}
              </button>
            )}
          </div>
        </div>
        {linePayUrl && (
          <div className="mt-3 rounded-md border border-border-default bg-inset p-3 text-xs">
            <div className="text-muted mb-1">決済リンク (24 時間有効):</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-[11px] text-primary">{linePayUrl}</code>
              <button
                type="button"
                className="btn-ghost text-[11px]"
                onClick={() => {
                  navigator.clipboard.writeText(linePayUrl).then(
                    () => setMsg({ text: "リンクをコピーしました", ok: true }),
                    () => setMsg({ text: "コピーに失敗しました", ok: false }),
                  );
                }}
              >
                📋 コピー
              </button>
            </div>
          </div>
        )}
        {paymentDateInput !== null && (
          <div className="mt-3 rounded-md border border-border-default bg-inset p-3 space-y-2">
            <div className="text-xs text-muted">入金日</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input-field text-sm"
                value={paymentDateInput}
                onChange={(e) => setPaymentDateInput(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-xs"
                disabled={updating}
                onClick={() => handleStatusChange("paid", paymentDateInput)}
              >
                {updating ? "処理中…" : "入金確定"}
              </button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setPaymentDateInput(null)}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Edit Form (canEdit && editing 時のみ) */}
      {canEdit && editing && (
        <DocumentForm
          mode="edit"
          initial={doc}
          onSaved={(updated) => {
            setDoc(updated);
            setEditing(false);
            setMsg({ text: "保存しました", ok: true });
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Document Detail (print-friendly) */}
      {!editing && (
        <div className="print-area">
          <section className="glass-card p-6 space-y-6 print:border-none print:shadow-none print:bg-white print:text-black">
            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-primary print:text-black">{docLabel}</h2>
                <div className="text-sm text-muted print:text-gray-600 mt-1 font-mono">{doc.doc_number}</div>
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

            {/* Vehicle Info */}
            {(() => {
              const vi = (doc.vehicle_info_json ?? {}) as { model?: string; plate?: string; vin?: string };
              if (!vi.model && !vi.plate && !vi.vin) return null;
              return (
                <div className="border-b border-border-subtle pb-4 print:border-gray-300">
                  <div className="text-xs text-muted print:text-gray-500">車両情報</div>
                  <div className="text-sm text-primary print:text-black mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {vi.model && <span>車種：{vi.model}</span>}
                    {vi.plate && <span>ナンバー：{vi.plate}</span>}
                    {vi.vin && <span className="font-mono">車台番号：{vi.vin}</span>}
                  </div>
                </div>
              );
            })()}

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border-default print:border-gray-400">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">内容</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">数量</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">単位</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">単価</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted print:text-gray-600">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const type = item.item_type ?? "item";
                    const content = itemContentLines(item);
                    if (type === "heading") {
                      return (
                        <tr
                          key={idx}
                          className="border-b border-border-subtle print:border-gray-200 bg-surface-hover/60"
                        >
                          <td
                            colSpan={5}
                            className="py-2.5 px-3 font-semibold text-primary print:text-black print:bg-gray-100"
                          >
                            {content.primary}
                          </td>
                        </tr>
                      );
                    }
                    if (type === "subtotal") {
                      return (
                        <tr key={idx} className="border-b border-border-subtle print:border-gray-200">
                          <td
                            colSpan={4}
                            className="py-2.5 px-3 text-right font-semibold text-secondary print:text-gray-700"
                          >
                            {item.description || "小計"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-primary print:text-black">
                            {formatJpy(item.amount)}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={idx} className="border-b border-border-subtle print:border-gray-200">
                        <td className="py-3 px-3 text-primary print:text-black">
                          {content.primary}
                          {item.tax_category === 8 && <span className="ml-1 text-[10px] text-muted">※軽減</span>}
                          {content.code && (
                            <span className="block text-[10px] text-muted print:text-gray-500 font-mono">
                              品番: {content.code}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right text-secondary print:text-gray-700">{item.quantity}</td>
                        <td className="py-3 px-3 text-left text-secondary print:text-gray-700">{item.unit ?? ""}</td>
                        <td className="py-3 px-3 text-right text-secondary print:text-gray-700">
                          {formatJpy(item.unit_price)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-primary print:text-black">
                          {formatJpy(item.amount)}
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted">
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
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="会社ロゴ" className="w-16 h-16 object-contain" />
                    ) : (
                      <div className="w-16 h-16 border border-border-subtle rounded-lg flex items-center justify-center text-muted print:border-gray-300">
                        LOGO
                      </div>
                    )}
                  </div>
                )}
                {doc.show_seal && (
                  <div className="text-xs text-muted print:text-gray-500 text-center">
                    {sealUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sealUrl} alt="角印" className="w-16 h-16 object-contain" />
                    ) : (
                      <div className="w-16 h-16 border border-dashed border-red-300 rounded-full flex items-center justify-center text-red-400 print:border-red-400">
                        印
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bank Info */}
            {doc.show_bank_info && tenant?.bank_info && (
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
            {doc.note && (
              <div className="border-t border-border-subtle pt-4 print:border-gray-300">
                <div className="text-xs text-muted print:text-gray-500">備考</div>
                <div className="text-sm text-secondary print:text-gray-700 mt-1 whitespace-pre-wrap">{doc.note}</div>
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
      )}

      {/* Source document link */}
      {doc.source_document_id && (
        <section className="glass-card p-5 text-sm print:hidden">
          <span className="text-muted">元帳票: </span>
          <a href={`/admin/documents/${doc.source_document_id}`} className="text-accent hover:text-accent underline">
            {doc.source_document_id}
          </a>
        </section>
      )}

      {/* 送付履歴 */}
      <section className="glass-card p-5 print:hidden">
        <h2 className="text-sm font-semibold text-primary mb-3">送付履歴</h2>
        {shareError ? (
          <p className="text-xs text-danger">送付履歴の取得に失敗しました。時間をおいて再読み込みしてください。</p>
        ) : shares.length === 0 ? (
          <p className="text-xs text-muted">まだ送付されていません。</p>
        ) : (
          <ul className="space-y-2">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle pb-2 text-xs last:border-0 last:pb-0"
              >
                <span className="text-muted tabular-nums">{formatDateTime(s.sent_at)}</span>
                <Badge variant="default">{CHANNEL_LABELS[s.channel] ?? s.channel}</Badge>
                <span className="text-secondary break-all">{s.recipient}</span>
                {s.status === "failed" ? <Badge variant="danger">失敗</Badge> : <Badge variant="success">送信済</Badge>}
                {s.status === "failed" && s.error_message && (
                  <span className="text-danger break-all">{s.error_message}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Meta */}
      <section className="glass-card p-5 text-xs text-muted space-y-1 print:hidden">
        <div>
          ID: <span className="font-mono">{doc.id}</span>
        </div>
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
          // 送付履歴を最新化（今の送付を反映）
          mutateShares();
        }}
      />
    </div>
  );
}
