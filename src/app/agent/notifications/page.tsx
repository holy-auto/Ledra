"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  info: { variant: "default", label: "お知らせ" },
  referral_status: { variant: "info", label: "紹介" },
  commission: { variant: "success", label: "コミッション" },
  campaign: { variant: "violet", label: "キャンペーン" },
  system: { variant: "warning", label: "システム" },
};

export default function AgentNotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
      fetchData();
    })();
  }, [supabase]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/agent/notifications");
    if (res.ok) {
      const json = await res.json();
      setNotifications(json.notifications ?? []);
    }
    setLoading(false);
  };

  const markAllRead = async () => {
    await fetch("/api/agent/notifications", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const markRead = async (id: string) => {
    await fetch("/api/agent/notifications", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  if (!ready) return null;

  const filtered = filter === "all"
    ? notifications
    : filter === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications.filter((n) => n.type === filter);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          NOTIFICATIONS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
          通知センター
          {unreadCount > 0 && (
            <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {unreadCount}
            </span>
          )}
        </h1>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "すべて" },
            { key: "unread", label: `未読 (${unreadCount})` },
            ...Object.entries(TYPE_MAP).map(([k, v]) => ({ key: k, label: v.label })),
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            すべて既読にする
          </button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-2xl bg-neutral-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          通知はありません
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const tm = TYPE_MAP[n.type] ?? TYPE_MAP.info;
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.is_read) markRead(n.id);
                  if (n.link) window.location.href = n.link;
                }}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors cursor-pointer hover:bg-neutral-50 ${
                  n.is_read ? "border-neutral-200" : "border-blue-200 bg-blue-50/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={tm.variant}>{tm.label}</Badge>
                        <span className="text-sm font-semibold text-neutral-900">{n.title}</span>
                      </div>
                      {n.body && <p className="mt-1 text-xs text-neutral-500">{n.body}</p>}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-neutral-400">{formatDateTime(n.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
