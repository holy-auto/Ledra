"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: "general" | "campaign" | "system" | "important";
  pinned: boolean;
  is_read: boolean;
  created_at: string;
}

const CATEGORY_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  general: { variant: "default", label: "一般" },
  campaign: { variant: "violet", label: "キャンペーン" },
  system: { variant: "info", label: "システム" },
  important: { variant: "danger", label: "重要" },
};

export default function AgentAnnouncementsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = "/agent/login";
    });
  }, [supabase]);

  // Fetch announcements
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/agent/announcements");
        if (!res.ok) throw new Error("お知らせの取得に失敗しました");
        const json = await res.json();
        if (!cancelled) {
          setAnnouncements(json.announcements ?? []);
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "エラーが発生しました",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch("/api/agent/announcements/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcement_id: id }),
      });
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)),
      );
    } catch {
      // silently ignore read-mark failures
    }
  }, []);

  const handleToggle = useCallback(
    (a: Announcement) => {
      if (expandedId === a.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(a.id);
      if (!a.is_read) {
        markAsRead(a.id);
      }
    },
    [expandedId, markAsRead],
  );

  // Sort: pinned first, then by date desc
  const sorted = useMemo(() => {
    return [...announcements].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [announcements]);

  /* ── Skeleton ── */
  const Skeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card p-5 animate-pulse">
          <div className="h-4 w-48 rounded bg-surface-hover mb-3" />
          <div className="h-3 w-full rounded bg-surface-hover mb-2" />
          <div className="h-3 w-2/3 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="space-y-1">
          <span className="section-tag">ANNOUNCEMENTS</span>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">
            お知らせ
          </h1>
          <p className="text-[14px] text-secondary leading-relaxed">
            本部からのお知らせ・キャンペーン情報
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="glass-card p-6">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-muted text-sm">現在お知らせはありません。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => {
            const cat = CATEGORY_MAP[a.category] ?? CATEGORY_MAP.general;
            const isExpanded = expandedId === a.id;

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleToggle(a)}
                className="glass-card w-full p-5 text-left transition-colors hover:bg-surface-hover/40"
              >
                {/* Top row */}
                <div className="flex items-start gap-3">
                  {/* Unread dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!a.is_read ? (
                      <span className="block h-2.5 w-2.5 rounded-full bg-accent" />
                    ) : (
                      <span className="block h-2.5 w-2.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {a.pinned && (
                        <span className="text-xs font-semibold text-warning-text">
                          ピン留め
                        </span>
                      )}
                      <Badge variant={cat.variant}>{cat.label}</Badge>
                      <span className="text-xs text-muted">
                        {formatDateTime(a.created_at)}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-primary">
                      {a.title}
                    </h3>

                    {isExpanded ? (
                      <div className="mt-3 text-sm text-secondary whitespace-pre-wrap leading-relaxed">
                        {a.body}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-muted line-clamp-2">
                        {a.body}
                      </p>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <span className="mt-1 flex-shrink-0 text-muted text-xs">
                    {isExpanded ? "閉じる" : "詳細"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
