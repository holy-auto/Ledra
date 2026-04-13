"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";

type InqStatus = "new" | "read" | "replied";

interface InquiryRow {
  id: string;
  customer_name: string | null;
  phone_last4_hash: string;
  subject: string;
  message: string;
  status: InqStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<InqStatus, string> = { new: "新規", read: "確認済", replied: "返信済" };
const STATUS_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "new", label: "新規" },
  { value: "read", label: "確認済" },
  { value: "replied", label: "返信済" },
];

function statusClass(s: InqStatus) {
  if (s === "new") return "bg-warning-dim text-warning-text";
  if (s === "read") return "bg-accent-dim text-accent-text";
  return "bg-success-dim text-success-text";
}

export default function CustomerInquiriesClient() {
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyMsg, setReplyMsg] = useState<string | null>(null);

  const fetchInquiries = useCallback(async (status = "all") => {
    setLoading(true);
    setErr(null);
    try {
      const q = status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
      const res = await fetch(`/api/admin/customer-inquiries${q}`, { credentials: "include", cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "取得に失敗しました");
      setInquiries(j.inquiries ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInquiries(statusFilter);
  }, [fetchInquiries, statusFilter]);

  async function markRead(id: string) {
    await fetch("/api/admin/customer-inquiries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, status: "read" }),
    }).catch(() => undefined);
    setInquiries((prev: InquiryRow[]) => prev.map((i: InquiryRow) => (i.id === id ? { ...i, status: "read" } : i)));
  }

  async function sendReply(id: string) {
    if (!replyText.trim()) return;
    setReplying(true);
    setReplyMsg(null);
    try {
      const res = await fetch("/api/admin/customer-inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, admin_reply: replyText.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "送信に失敗しました");
      setInquiries((prev: InquiryRow[]) =>
        prev.map((i: InquiryRow) =>
          i.id === id
            ? { ...i, status: "replied", admin_reply: replyText.trim(), replied_at: new Date().toISOString() }
            : i,
        ),
      );
      setReplyText("");
      setReplyMsg("返信を保存しました。");
    } catch (e: any) {
      setReplyMsg(e?.message ?? "エラーが発生しました");
    } finally {
      setReplying(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader tag="顧客管理" title="お客様問い合わせ" description="マイページから届いたお客様からの問い合わせを管理します" />

      {/* フィルタ */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === f.value
                ? "bg-accent text-white"
                : "border border-border-default bg-surface text-secondary hover:bg-surface-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => fetchInquiries(statusFilter)}
          className="ml-auto rounded-full border border-border-default bg-surface px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-hover"
        >
          更新
        </button>
      </div>

      {loading && <div className="text-sm text-muted py-4">読み込み中…</div>}
      {err && <div className="rounded-xl bg-danger-dim text-danger-text px-4 py-3 text-sm mb-4">{err}</div>}

      <div className="space-y-3">
        {!loading && inquiries.length === 0 && (
          <div className="rounded-2xl border border-border-default bg-surface px-4 py-6 text-center text-sm text-muted">
            問い合わせはありません。
          </div>
        )}

        {inquiries.map((inq) => {
          const isExpanded = expanded === inq.id;
          return (
            <div key={inq.id} className="rounded-2xl border border-border-default bg-surface shadow-sm overflow-hidden">
              {/* ヘッダー行 */}
              <button
                onClick={() => {
                  if (!isExpanded && inq.status === "new") markRead(inq.id);
                  setExpanded(isExpanded ? null : inq.id);
                  setReplyText(inq.admin_reply ?? "");
                  setReplyMsg(null);
                }}
                className="w-full text-left px-5 py-4 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-primary">{inq.subject}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusClass(inq.status)}`}>
                        {STATUS_LABELS[inq.status]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {inq.customer_name ?? "お客様"} ·{" "}
                      {new Date(inq.created_at).toLocaleString("ja-JP")}
                    </div>
                  </div>
                  <span className="text-muted text-sm shrink-0">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* 展開内容 */}
              {isExpanded && (
                <div className="border-t border-border-subtle px-5 py-4 space-y-4">
                  {/* メッセージ */}
                  <div>
                    <div className="text-xs font-semibold text-muted mb-1 uppercase tracking-wide">お客様メッセージ</div>
                    <p className="text-sm text-primary whitespace-pre-wrap leading-relaxed">{inq.message}</p>
                  </div>

                  {/* 既存の返信 */}
                  {inq.admin_reply && (
                    <div className="rounded-xl bg-accent-dim px-4 py-3">
                      <div className="text-xs font-semibold text-accent mb-1">返信済み内容</div>
                      <p className="text-sm text-primary whitespace-pre-wrap">{inq.admin_reply}</p>
                      {inq.replied_at && (
                        <div className="text-xs text-muted mt-1">{new Date(inq.replied_at).toLocaleString("ja-JP")}</div>
                      )}
                    </div>
                  )}

                  {/* 返信フォーム */}
                  <div>
                    <div className="text-xs font-semibold text-muted mb-1 uppercase tracking-wide">
                      {inq.admin_reply ? "返信内容を更新" : "返信を入力"}
                    </div>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      placeholder="お客様への返信内容を入力…"
                      className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                    />
                    {replyMsg && (
                      <div className="mt-2 text-xs text-success-text">{replyMsg}</div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => sendReply(inq.id)}
                        disabled={replying || !replyText.trim()}
                        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                      >
                        {replying ? "保存中…" : "返信を保存"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
