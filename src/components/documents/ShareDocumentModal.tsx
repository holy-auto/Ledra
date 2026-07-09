"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { DOC_TYPES, type DocType } from "@/types/document";

interface ShareDocumentModalProps {
  open: boolean;
  onClose: () => void;
  document: {
    id: string;
    doc_number: string;
    doc_type: string;
    customer_id?: string | null;
  };
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  onShared?: (channel: string) => void;
}

type OtherDocument = {
  id: string;
  doc_number: string;
  doc_type: string;
  total: number;
};

type Channel = "email" | "line" | "sms";

const TABS: { key: Channel; label: string }[] = [
  { key: "email", label: "メール" },
  { key: "line", label: "LINE" },
  { key: "sms", label: "SMS" },
];

export default function ShareDocumentModal({
  open,
  onClose,
  document: doc,
  customerName,
  customerEmail,
  customerPhone,
  onShared,
}: ShareDocumentModalProps) {
  const [tab, setTab] = useState<Channel>("email");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Form fields
  const [email, setEmail] = useState(customerEmail ?? "");
  const [lineUserId, setLineUserId] = useState("");
  const [phone, setPhone] = useState(customerPhone ?? "");
  const [message, setMessage] = useState("");

  // Other documents of the same customer, selectable to bundle into the email
  const [otherDocs, setOtherDocs] = useState<OtherDocument[]>([]);
  const [loadingOthers, setLoadingOthers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !doc.customer_id) {
      setOtherDocs([]);
      setSelectedIds(new Set());
      return;
    }
    let cancelled = false;
    setLoadingOthers(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/documents?customer_id=${doc.customer_id}&page=1&per_page=50`);
        const j = await parseJsonSafe(res);
        if (cancelled) return;
        const docs: OtherDocument[] = (j?.documents ?? []).filter((d: OtherDocument) => d.id !== doc.id);
        setOtherDocs(docs);
      } catch {
        if (!cancelled) setOtherDocs([]);
      } finally {
        if (!cancelled) setLoadingOthers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, doc.id, doc.customer_id]);

  const resetForm = () => {
    setResult(null);
    setMessage("");
  };

  const handleSend = async () => {
    setSending(true);
    setResult(null);

    let recipient = "";
    if (tab === "email") recipient = email.trim();
    else if (tab === "line") recipient = lineUserId.trim();
    else if (tab === "sms") recipient = phone.trim();

    if (!recipient) {
      setResult({ ok: false, text: "送信先を入力してください。" });
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/documents/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          document_id: doc.id,
          channel: tab,
          recipient,
          message: message.trim() || undefined,
          ...(tab === "email" && selectedIds.size > 0 ? { additional_document_ids: Array.from(selectedIds) } : {}),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(j?.message ?? `送信に失敗しました (${res.status})`);
      }
      setResult({ ok: true, text: "送信しました。" });
      onShared?.(tab);
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${doc.doc_number} を共有`}
      footer={
        <>
          <button type="button" className="btn-ghost text-sm" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="btn-primary text-sm" disabled={sending} onClick={handleSend}>
            {sending ? "送信中..." : "送信"}
          </button>
        </>
      }
    >
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-[var(--bg-primary)] text-primary shadow-sm" : "text-muted hover:text-secondary"
            }`}
            onClick={() => {
              setTab(t.key);
              resetForm();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Result message */}
      {result && <div className={`text-sm ${result.ok ? "text-success" : "text-danger"}`}>{result.text}</div>}

      {/* Email tab */}
      {tab === "email" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="share-email" className="mb-1 block text-xs text-muted">
              メールアドレス
            </label>
            <input
              id="share-email"
              type="email"
              className="input-field w-full"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="share-email-message" className="mb-1 block text-xs text-muted">
              メッセージ（任意）
            </label>
            <textarea
              id="share-email-message"
              className="input-field w-full"
              rows={3}
              placeholder="添付メッセージを入力..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {loadingOthers && <p className="text-xs text-muted">他の帳票を読み込み中...</p>}
          {otherDocs.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted">他の帳票も一緒に送付（任意）</label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-2">
                {otherDocs.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(d.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.id);
                          else next.delete(d.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      {DOC_TYPES[d.doc_type as DocType]?.label ?? d.doc_type} {d.doc_number}
                    </span>
                    <span className="ml-auto text-muted">&yen;{d.total.toLocaleString("ja-JP")}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LINE tab */}
      {tab === "line" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="share-line-userid" className="mb-1 block text-xs text-muted">
              LINE ユーザーID
            </label>
            <input
              id="share-line-userid"
              type="text"
              className="input-field w-full"
              placeholder="U1234567890abcdef..."
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">LINE公式アカウントと友だち登録済みのユーザーIDを入力してください。</p>
          <div>
            <label htmlFor="share-line-message" className="mb-1 block text-xs text-muted">
              メッセージ（任意）
            </label>
            <textarea
              id="share-line-message"
              className="input-field w-full"
              rows={3}
              placeholder="追加メッセージを入力..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* SMS tab */}
      {tab === "sms" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="share-sms-phone" className="mb-1 block text-xs text-muted">
              電話番号
            </label>
            <input
              id="share-sms-phone"
              type="tel"
              className="input-field w-full"
              placeholder="090-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="share-sms-message" className="mb-1 block text-xs text-muted">
              メッセージ（任意）
            </label>
            <textarea
              id="share-sms-message"
              className="input-field w-full"
              rows={3}
              placeholder="追加メッセージを入力..."
              maxLength={160}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted">{message.length} / 160文字</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
