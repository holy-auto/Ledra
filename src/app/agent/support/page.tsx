"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
};

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  open: { variant: "info", label: "受付中" },
  in_progress: { variant: "warning", label: "対応中" },
  awaiting_reply: { variant: "violet", label: "返信待ち" },
  resolved: { variant: "success", label: "解決済み" },
  closed: { variant: "default", label: "クローズ" },
};

const CATEGORY_MAP: Record<string, string> = {
  general: "一般", billing: "請求", technical: "技術", contract: "契約", other: "その他",
};

const PRIORITY_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  low: { variant: "default", label: "低" },
  normal: { variant: "info", label: "通常" },
  high: { variant: "warning", label: "高" },
  urgent: { variant: "danger", label: "緊急" },
};

export default function AgentSupportPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
      fetchTickets();
    })();
  }, [supabase]);

  const fetchTickets = async () => {
    setLoading(true);
    const res = await fetch("/api/agent/support");
    if (res.ok) setTickets((await res.json()).tickets ?? []);
    setLoading(false);
  };

  const createTicket = async () => {
    if (!subject.trim() || !message.trim()) return;
    setCreating(true);
    const res = await fetch("/api/agent/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, category, priority, message }),
    });
    if (res.ok) {
      setShowNew(false);
      setSubject(""); setMessage("");
      fetchTickets();
    }
    setCreating(false);
  };

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setMsgLoading(true);
    const res = await fetch(`/api/agent/support/${ticket.id}/messages`);
    if (res.ok) setMessages((await res.json()).messages ?? []);
    setMsgLoading(false);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);
    const res = await fetch(`/api/agent/support/${selectedTicket.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: replyText }),
    });
    if (res.ok) {
      setReplyText("");
      openTicket(selectedTicket);
    }
    setSending(false);
  };

  if (!ready) return null;

  // Detail view
  if (selectedTicket) {
    const st = STATUS_MAP[selectedTicket.status] ?? STATUS_MAP.open;
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedTicket(null)} className="text-sm text-muted hover:text-secondary">
          &larr; チケット一覧に戻る
        </button>
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-primary">{selectedTicket.subject}</h2>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted">
            {CATEGORY_MAP[selectedTicket.category]} | {formatDateTime(selectedTicket.created_at)}
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-3">
          {msgLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-surface-hover" />)}
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`rounded-2xl border p-4 shadow-sm ${msg.is_admin ? "border-blue-200 bg-blue-50/30" : "border-border-default bg-surface"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold ${msg.is_admin ? "text-blue-600" : "text-secondary"}`}>
                    {msg.is_admin ? "サポート担当" : "あなた"}
                  </span>
                  <span className="text-[11px] text-muted">{formatDateTime(msg.created_at)}</span>
                </div>
                <p className="text-sm text-secondary whitespace-pre-wrap">{msg.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Reply */}
        {selectedTicket.status !== "closed" && selectedTicket.status !== "resolved" && (
          <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="返信を入力..."
              rows={3}
              className="w-full rounded-xl border border-border-default bg-inset px-4 py-2.5 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-inverse hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? "送信中..." : "返信する"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary">
          SUPPORT
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-primary">サポート</h1>
        <p className="mt-1 text-sm text-muted">本部への質問・相談はこちらから</p>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowNew(!showNew)} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-inverse hover:bg-primary/90">
          {showNew ? "閉じる" : "新規チケット"}
        </button>
      </div>

      {showNew && (
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">件名 *</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">カテゴリ</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm">
                {Object.entries(CATEGORY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">優先度</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm">
                {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">内容 *</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowNew(false)} className="rounded-xl border border-border-default px-4 py-2 text-sm font-medium text-secondary hover:bg-inset">キャンセル</button>
            <button onClick={createTicket} disabled={creating} className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-inverse hover:bg-primary/90 disabled:opacity-50">{creating ? "作成中..." : "送信"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-surface-hover" />)}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface p-8 text-center text-sm text-muted">
          チケットはまだありません
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const st = STATUS_MAP[t.status] ?? STATUS_MAP.open;
            const pr = PRIORITY_MAP[t.priority] ?? PRIORITY_MAP.normal;
            return (
              <button
                key={t.id}
                onClick={() => openTicket(t)}
                className="w-full rounded-2xl border border-border-default bg-surface p-4 shadow-sm text-left hover:bg-inset transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{t.subject}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <Badge variant={pr.variant}>{pr.label}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {CATEGORY_MAP[t.category]} | 作成: {formatDateTime(t.created_at)} | 更新: {formatDateTime(t.updated_at)}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-muted">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
