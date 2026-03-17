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
  info: { label: "お知らせ", color: "text-[#0071e3]", bg: "bg-[rgba(0,113,227,0.06)]", border: "border-[rgba(0,113,227,0.15)]" },
  update: { label: "アップデート", color: "text-[#28a745]", bg: "bg-[rgba(40,167,69,0.06)]", border: "border-[rgba(40,167,69,0.15)]" },
  maintenance: { label: "メンテナンス", color: "text-[#b35c00]", bg: "bg-[rgba(179,92,0,0.06)]", border: "border-[rgba(179,92,0,0.15)]" },
  important: { label: "重要", color: "text-[#d1242f]", bg: "bg-[rgba(209,36,47,0.06)]", border: "border-[rgba(209,36,47,0.15)]" },
};

export default function AnnouncementsBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setAnnouncements(j.announcements ?? []);
    } catch { /* ignore */ }
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

  // Show only unread or recent (max 5)
  const visible = announcements.slice(0, 5);
  const unreadCount = announcements.filter((a) => !a.is_read).length;

  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#0071e3]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted">運営からのお知らせ</h2>
        {unreadCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d1242f] px-1.5 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {visible.map((ann) => {
          const config = CATEGORY_CONFIG[ann.category] ?? CATEGORY_CONFIG.info;
          const isExpanded = expandedId === ann.id;
          return (
            <button
              key={ann.id}
              type="button"
              onClick={() => toggleExpand(ann.id)}
              className={`w-full text-left rounded-xl border ${config.border} ${config.bg} p-4 transition-all hover:shadow-sm`}
            >
              <div className="flex items-start gap-3">
                {!ann.is_read && (
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#0071e3]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-muted">
                      {new Date(ann.published_at).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-primary leading-tight">
                    {ann.title}
                  </div>
                  {isExpanded && (
                    <div className="mt-2 text-xs text-secondary whitespace-pre-wrap leading-relaxed">
                      {ann.body}
                    </div>
                  )}
                </div>
                <svg
                  width="16"
                  height="16"
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
    </div>
  );
}
