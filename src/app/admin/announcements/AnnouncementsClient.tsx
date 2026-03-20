"use client";

import { useCallback, useEffect, useState } from "react";

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: "info" | "update" | "maintenance" | "important";
  published_at: string;
  is_read: boolean;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  info: { label: "お知らせ", color: "text-accent-text", bg: "bg-accent-dim", border: "border-accent/15" },
  update: { label: "アップデート", color: "text-success-text", bg: "bg-success-dim", border: "border-success/15" },
  maintenance: { label: "メンテナンス", color: "text-warning-text", bg: "bg-warning-dim", border: "border-warning/15" },
  important: { label: "重要", color: "text-danger-text", bg: "bg-danger-dim", border: "border-danger/15" },
};

const CATEGORY_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "info", label: "お知らせ" },
  { value: "update", label: "アップデート" },
  { value: "maintenance", label: "メンテナンス" },
  { value: "important", label: "重要" },
];

export default function AnnouncementsClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setAnnouncements(j.announcements ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const markAsRead = async (id: string) => {
    try {
      await fetch("/api/announcements/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ announcement_id: id }),
      });
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
      );
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      const ann = announcements.find((a) => a.id === id);
      if (ann && !ann.is_read) markAsRead(id);
    }
  };

  const filtered = categoryFilter === "all"
    ? announcements
    : announcements.filter((a) => a.category === categoryFilter);

  const unreadCount = announcements.filter((a) => !a.is_read).length;

  if (loading) return <div className="text-sm text-muted">読み込み中...</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
          <div className="mt-2 text-2xl font-bold text-primary">{announcements.length}</div>
          <div className="mt-1 text-xs text-muted">お知らせ</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">未読</div>
          <div className="mt-2 text-2xl font-bold text-danger-text">{unreadCount}</div>
          <div className="mt-1 text-xs text-muted">未読のお知らせ</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">既読</div>
          <div className="mt-2 text-2xl font-bold text-success-text">{announcements.length - unreadCount}</div>
          <div className="mt-1 text-xs text-muted">既読のお知らせ</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setCategoryFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === f.value
                ? "bg-accent text-inverse"
                : "bg-surface-hover text-secondary hover:bg-surface-active"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Announcements List */}
      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          お知らせはありません
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ann) => {
            const config = CATEGORY_CONFIG[ann.category] ?? CATEGORY_CONFIG.info;
            const isExpanded = expandedId === ann.id;
            return (
              <button
                key={ann.id}
                type="button"
                onClick={() => toggleExpand(ann.id)}
                className={`w-full text-left glass-card border ${config.border} ${isExpanded ? config.bg : ""} p-5 transition-all hover:shadow-sm`}
              >
                <div className="flex items-start gap-3">
                  {!ann.is_read && (
                    <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.color} ${config.bg}`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(ann.published_at).toLocaleDateString("ja-JP", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-primary leading-tight">
                      {ann.title}
                    </div>
                    {isExpanded && (
                      <div className="mt-3 text-sm text-secondary whitespace-pre-wrap leading-relaxed border-t border-border-subtle pt-3">
                        {ann.body}
                      </div>
                    )}
                  </div>
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`flex-shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
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
