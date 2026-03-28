"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/* ── notification type config ── */

const TYPE_CONFIG: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  case_update: { icon: "📋", label: "案件更新", color: "blue" },
  pii_approved: { icon: "✅", label: "PII開示承認", color: "emerald" },
  pii_rejected: { icon: "❌", label: "PII開示却下", color: "red" },
  new_message: { icon: "💬", label: "新規メッセージ", color: "purple" },
  system: { icon: "🔔", label: "システム通知", color: "neutral" },
};

function typeColor(type: string) {
  const c = TYPE_CONFIG[type]?.color ?? "neutral";
  const map: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    purple: "bg-purple-100 text-purple-700",
    neutral: "bg-neutral-100 text-neutral-600",
  };
  return map[c] ?? map.neutral;
}

/* ── types ── */

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/* ── helpers ── */

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(dateStr).toLocaleDateString("ja-JP");
}

/* ── component ── */

export default function InsurerNotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* auth check */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  /* fetch notifications */
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/notifications");
      if (!res.ok) throw new Error("通知の取得に失敗しました");
      const json = await res.json();
      setNotifications(json.notifications ?? []);
      setUnreadCount(json.unread_count ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchNotifications();
  }, [ready, fetchNotifications]);

  /* mark single as read */
  async function markAsRead(id: string) {
    // Optimistically update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await fetch("/api/insurer/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // Revert on failure
      fetchNotifications();
    }
  }

  /* mark all as read */
  async function markAllAsRead() {
    // Optimistically update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/insurer/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      fetchNotifications();
    }
  }

  /* click handler — mark read + navigate */
  function handleClick(notification: Notification) {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-neutral-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">通知センター</h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-neutral-500">
              {unreadCount}件の未読通知
            </p>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200"
          >
            すべて既読
          </button>
        )}
      </div>

      {/* Error */}
      {err && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="text-neutral-400">読み込み中...</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && notifications.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white py-16 text-center">
          <div className="mb-2 text-4xl">🔔</div>
          <p className="text-neutral-500">通知はまだありません</p>
        </div>
      )}

      {/* Notification list */}
      {!loading && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
            const content = (
              <div
                className={`flex items-start gap-4 rounded-2xl border p-4 transition ${
                  n.is_read
                    ? "border-neutral-200 bg-white"
                    : "border-blue-200 bg-blue-50/50"
                } hover:shadow-sm`}
              >
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${typeColor(n.type)}`}
                >
                  {cfg.icon}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${typeColor(n.type)}`}
                      >
                        {cfg.label}
                      </span>
                      <h3
                        className={`mt-1 text-sm ${n.is_read ? "font-normal text-neutral-700" : "font-semibold text-neutral-900"}`}
                      >
                        {n.title}
                      </h3>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {!n.is_read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                      )}
                      <span className="text-xs text-neutral-400 whitespace-nowrap">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                  </div>

                  {n.body && (
                    <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                </div>
              </div>
            );

            if (n.link) {
              return (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => handleClick(n)}
                  className="block"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className="cursor-pointer"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
