"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

/* ── Types ── */
type Notification = {
  id: string;
  agent_id: string;
  agent_name: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/* ── Type map ── */
const TYPE_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  info:            { label: "情報",           variant: "info" },
  referral_status: { label: "紹介",           variant: "success" },
  commission:      { label: "コミッション",   variant: "violet" },
  campaign:        { label: "キャンペーン",   variant: "warning" },
  system:          { label: "システム",       variant: "default" },
};

const TYPE_OPTIONS = [
  { value: "info",            label: "情報" },
  { value: "referral_status", label: "紹介" },
  { value: "commission",      label: "コミッション" },
  { value: "campaign",        label: "キャンペーン" },
  { value: "system",          label: "システム" },
];

function typeEntry(t: string) {
  return TYPE_MAP[t] ?? { label: t, variant: "default" as BadgeVariant };
}

export default function AdminNotificationsClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  /* form state */
  const [formAgentId, setFormAgentId] = useState("");
  const [formType, setFormType] = useState("info");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formLink, setFormLink] = useState("");

  /* ── Fetch ── */
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agent-notifications", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setNotifications(json.notifications ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  /* ── Create ── */
  const handleCreate = async () => {
    if (!formAgentId || !formTitle) {
      setMsg("代理店IDとタイトルは必須です");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: formAgentId,
          type: formType,
          title: formTitle,
          body: formBody || null,
          link: formLink || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setMsg("通知を送信しました");
      setShowForm(false);
      resetForm();
      fetchNotifications();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setFormAgentId("");
    setFormType("info");
    setFormTitle("");
    setFormBody("");
    setFormLink("");
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <span className="text-sm text-muted">{notifications.length} 件</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? "閉じる" : "新規通知"}
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">
          {msg}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="rounded-2xl border border-default bg-surface-solid shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-primary">通知を作成</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-secondary mb-1 block">代理店ID *</label>
              <input
                type="text"
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
                className="input-field w-full"
                placeholder="UUID"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">種別 *</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="input-field w-full"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-secondary mb-1 block">タイトル *</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="input-field w-full"
              placeholder="通知タイトル"
            />
          </div>

          <div>
            <label className="text-sm text-secondary mb-1 block">本文</label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              rows={4}
              className="input-field w-full"
              placeholder="通知の本文"
            />
          </div>

          <div>
            <label className="text-sm text-secondary mb-1 block">リンク（任意）</label>
            <input
              type="text"
              value={formLink}
              onChange={(e) => setFormLink(e.target.value)}
              className="input-field w-full"
              placeholder="https://..."
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="rounded-xl border border-default bg-surface-solid px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
            >
              キャンセル
            </button>
            <button onClick={handleCreate} disabled={busy} className="btn-primary">
              {busy ? "送信中..." : "送信"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-[rgba(0,0,0,0.04)]" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-default bg-surface-solid shadow-sm p-8 text-center text-muted">
          通知がまだありません
        </div>
      ) : (
        <div className="rounded-2xl border border-default bg-surface-solid shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">代理店</th>
                  <th className="p-3 text-left font-semibold text-secondary">種別</th>
                  <th className="p-3 text-left font-semibold text-secondary">タイトル</th>
                  <th className="p-3 text-left font-semibold text-secondary">本文</th>
                  <th className="p-3 text-left font-semibold text-secondary">既読</th>
                  <th className="p-3 text-left font-semibold text-secondary">作成日</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => {
                  const t = typeEntry(n.type);
                  return (
                    <tr key={n.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]">
                      <td className="p-3 font-medium text-primary">{n.agent_name || n.agent_id}</td>
                      <td className="p-3">
                        <Badge variant={t.variant}>{t.label}</Badge>
                      </td>
                      <td className="p-3 text-primary">
                        {n.link ? (
                          <a
                            href={n.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-info"
                          >
                            {n.title}
                          </a>
                        ) : (
                          n.title
                        )}
                      </td>
                      <td className="p-3 text-muted max-w-[240px] truncate">{n.body || "-"}</td>
                      <td className="p-3">
                        {n.is_read ? (
                          <span className="text-xs text-success">既読</span>
                        ) : (
                          <span className="text-xs text-muted">未読</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(n.created_at)}</td>
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
