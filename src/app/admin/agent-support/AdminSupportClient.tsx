"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState, useCallback } from "react";
import Badge from "@/components/ui/Badge";
import type { BadgeVariant } from "@/lib/statusMaps";
import { formatDateTime } from "@/lib/format";

/* ── Types ── */

type Agent = { id: string; name: string };

type Ticket = {
  id: string;
  agent_id: string;
  user_id: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  agents: Agent | null;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
};

/* ── Status / Priority / Category Maps ── */

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  open: { variant: "info", label: "受付中" },
  in_progress: { variant: "warning", label: "対応中" },
  awaiting_reply: { variant: "violet", label: "返信待ち" },
  resolved: { variant: "success", label: "解決済み" },
  closed: { variant: "default", label: "クローズ" },
};

const PRIORITY_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  low: { variant: "default", label: "低" },
  normal: { variant: "info", label: "通常" },
  high: { variant: "warning", label: "高" },
  urgent: { variant: "danger", label: "緊急" },
};

const CATEGORY_MAP: Record<string, string> = {
  general: "一般",
  billing: "請求",
  technical: "技術",
  contract: "契約",
  other: "その他",
};

const STATUS_TABS = [
  { value: "", label: "すべて" },
  { value: "open", label: "受付中" },
  { value: "in_progress", label: "対応中" },
  { value: "awaiting_reply", label: "返信待ち" },
  { value: "resolved", label: "解決済み" },
  { value: "closed", label: "クローズ" },
];

const STATUS_OPTIONS = ["open", "in_progress", "awaiting_reply", "resolved", "closed"];

/* ── Component ── */

export default function AdminSupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // Detail view
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* ── Fetch tickets ── */
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/agent-support${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTickets(json.tickets ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  /* ── Fetch single ticket detail ── */
  const openTicket = async (ticket: Ticket) => {
    setSelected(ticket);
    setMessages([]);
    setReplyText("");
    setMsg(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-support/${ticket.id}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setSelected(json.ticket ?? ticket);
        setMessages(json.messages ?? []);
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── Send reply ── */
  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-support/${selected.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setReplyText("");
      // Refresh detail
      await openTicket(selected);
      fetchTickets();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  /* ── Update status ── */
  const updateStatus = async (newStatus: string) => {
    if (!selected) return;
    setActionBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-support/${selected.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setMsg(`ステータスを「${STATUS_MAP[newStatus]?.label ?? newStatus}」に更新しました`);
      await openTicket({ ...selected, status: newStatus });
      fetchTickets();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  /* ── Detail View ── */
  if (selected) {
    const s = STATUS_MAP[selected.status] ?? { variant: "default" as BadgeVariant, label: selected.status };
    const p = PRIORITY_MAP[selected.priority] ?? { variant: "default" as BadgeVariant, label: selected.priority };

    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => {
            setSelected(null);
            setMsg(null);
          }}
          className="text-sm text-accent hover:underline"
        >
          &larr; チケット一覧に戻る
        </button>

        {/* Ticket header */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-primary">{selected.subject}</h2>
              <div className="flex flex-wrap gap-2 text-sm text-muted">
                <span>{selected.agents?.name ?? "不明"}</span>
                <span>|</span>
                <span>{CATEGORY_MAP[selected.category] ?? selected.category}</span>
                <span>|</span>
                <span>{formatDateTime(selected.created_at)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={s.variant}>{s.label}</Badge>
              <Badge variant={p.variant}>{p.label}</Badge>
            </div>
          </div>

          {/* Status change */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-secondary">ステータス変更:</label>
            <select
              value={selected.status}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={actionBusy}
              className="rounded-xl border border-default bg-surface-solid px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            >
              {STATUS_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {STATUS_MAP[v]?.label ?? v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {msg && (
          <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>
        )}

        {/* Messages */}
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-secondary">メッセージ</h3>

          {detailLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted">メッセージはありません</p>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-2xl p-4 text-sm ${
                    m.is_admin
                      ? "ml-8 bg-accent-dim border border-accent/20"
                      : "mr-8 bg-[var(--bg-inset)] border border-[var(--border-subtle)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-secondary">{m.is_admin ? "管理者" : "代理店"}</span>
                    <span className="text-xs text-muted">{formatDateTime(m.created_at)}</span>
                  </div>
                  <p className="text-primary whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Reply form */}
          <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="返信を入力..."
              rows={3}
              className="w-full rounded-xl border border-default bg-surface-solid px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] resize-none"
            />
            <div className="flex justify-end">
              <button onClick={sendReply} disabled={sending || !replyText.trim()} className="btn-primary">
                {sending ? "送信中..." : "返信する"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── List View ── */
  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-accent text-white shadow-sm"
                : "bg-surface-solid text-secondary border border-default hover:bg-surface-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <span className="text-sm text-muted">{tickets.length} 件</span>

      {/* Ticket list */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">チケットがありません</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">代理店</th>
                  <th className="p-3 text-left font-semibold text-secondary">件名</th>
                  <th className="p-3 text-left font-semibold text-secondary">カテゴリ</th>
                  <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
                  <th className="p-3 text-left font-semibold text-secondary">優先度</th>
                  <th className="p-3 text-left font-semibold text-secondary">作成日</th>
                  <th className="p-3 text-left font-semibold text-secondary">更新日</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const s = STATUS_MAP[t.status] ?? { variant: "default" as BadgeVariant, label: t.status };
                  const p = PRIORITY_MAP[t.priority] ?? { variant: "default" as BadgeVariant, label: t.priority };
                  return (
                    <tr
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <td className="p-3 font-medium text-primary">{t.agents?.name ?? "不明"}</td>
                      <td className="p-3 text-primary">{t.subject}</td>
                      <td className="p-3 text-muted">{CATEGORY_MAP[t.category] ?? t.category}</td>
                      <td className="p-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={p.variant}>{p.label}</Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(t.created_at)}</td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(t.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
