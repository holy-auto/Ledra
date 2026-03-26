"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";

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
        }),
      });
      const j = await res.json().catch(() => null);
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
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={sending}
            onClick={handleSend}
          >
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
              tab === t.key
                ? "bg-[var(--bg-primary)] text-primary shadow-sm"
                : "text-muted hover:text-secondary"
            }`}
            onClick={() => { setTab(t.key); resetForm(); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Result message */}
      {result && (
        <div className={`text-sm ${result.ok ? "text-success" : "text-danger"}`}>
          {result.text}
        </div>
      )}

      {/* Email tab */}
      {tab === "email" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">メールアドレス</label>
            <input
              type="email"
              className="input-field w-full"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">メッセージ（任意）</label>
            <textarea
              className="input-field w-full"
              rows={3}
              placeholder="添付メッセージを入力..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* LINE tab */}
      {tab === "line" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">LINE ユーザーID</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="U1234567890abcdef..."
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            LINE公式アカウントと友だち登録済みのユーザーIDを入力してください。
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted">メッセージ（任意）</label>
            <textarea
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
            <label className="mb-1 block text-xs text-muted">電話番号</label>
            <input
              type="tel"
              className="input-field w-full"
              placeholder="090-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">メッセージ（任意）</label>
            <textarea
              className="input-field w-full"
              rows={3}
              placeholder="追加メッセージを入力..."
              maxLength={160}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted">
              {message.length} / 160文字
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
