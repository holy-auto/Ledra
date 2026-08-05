"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Notification {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  link_path: string | null;
}

type NotificationApiRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  link_path: string | null;
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications?limit=10");
      if (!res.ok) return;
      const json = await res.json();
      // API は { notifications: [...] } を返す (read_at / link_path)。
      const rows: NotificationApiRow[] = json.notifications ?? json.rows ?? [];
      setNotifications(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body ?? "",
          created_at: r.created_at,
          read: r.read_at != null,
          link_path: r.link_path ?? null,
        })),
      );
    } catch {
      // silently ignore - API may not exist yet
    }
  }, []);

  useEffect(() => {
    // Delay initial fetch by 3 s so it doesn't compete with the page's own
    // data requests on mount (prevents INP / TTFB regression on admin routes).
    const initTimer = setTimeout(fetchNotifications, 3_000);
    const pollTimer = setInterval(fetchNotifications, 60_000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(pollTimer);
    };
  }, [fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markAllRead = async () => {
    // 楽観的に既読表示。サーバにも永続化しないと次のポーリング再取得で未読に戻る
    // (read_at が null のまま) ため、必ず API を叩いてから再取得する。
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/admin/notifications/read-all", { method: "PUT" });
    } catch {
      // 失敗時は次回ポーリングで元の未読状態に戻る (サーバが真実)。
    }
    fetchNotifications();
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60_000) return "たった今";
      if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分前`;
      if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}時間前`;
      return `${Math.floor(diff / 86400_000)}日前`;
    } catch {
      return "";
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-hover transition-colors"
        aria-label="通知"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // ベルはトップバー右端にあるため right-0 で左方向に開く。left-0 だと 288px の
        // パネルが右にはみ出し、モバイル/タブレットで画面外に切れてしまう。
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border-subtle bg-[var(--bg-surface-solid)] shadow-xl overflow-hidden z-50 animate-[hero-fade-in_0.15s_ease-out]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <span className="text-sm font-semibold text-primary">通知</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent hover:underline">
                すべて既読
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">通知はありません</div>
            ) : (
              notifications.map((n) => {
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-primary line-clamp-1">{n.title}</div>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted">{formatTime(n.created_at)}</p>
                  </>
                );
                const cls = `block px-4 py-3 border-b border-border-subtle last:border-b-0 transition-colors ${
                  n.read ? "" : "bg-accent-dim/30"
                }`;
                return n.link_path ? (
                  <a
                    key={n.id}
                    href={n.link_path}
                    onClick={() => setOpen(false)}
                    className={`${cls} hover:bg-surface-hover`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={n.id} className={cls}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
