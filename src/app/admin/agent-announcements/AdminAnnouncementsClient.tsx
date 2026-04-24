"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState, useCallback } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

/* ── Types ── */

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type FormData = {
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  published_at: string;
};

/* ── Category helpers ── */

const CATEGORY_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  general: { label: "一般", variant: "info" },
  campaign: { label: "キャンペーン", variant: "success" },
  system: { label: "システム", variant: "warning" },
  important: { label: "重要", variant: "danger" },
};

const CATEGORY_OPTIONS = [
  { value: "general", label: "一般" },
  { value: "campaign", label: "キャンペーン" },
  { value: "system", label: "システム" },
  { value: "important", label: "重要" },
];

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm(): FormData {
  return {
    title: "",
    body: "",
    category: "general",
    is_pinned: false,
    published_at: toLocalDatetime(new Date().toISOString()),
  };
}

/* ── Component ── */

export default function AdminAnnouncementsClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());

  // delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /* ── Fetch ── */

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agent-announcements", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setAnnouncements(json.announcements ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  /* ── Flash message ── */

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  /* ── Create / Update ── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      flash("タイトルを入力してください", false);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        category: form.category,
        is_pinned: form.is_pinned,
        published_at: form.published_at ? new Date(form.published_at).toISOString() : new Date().toISOString(),
      };

      const url = editingId ? `/api/admin/agent-announcements/${editingId}` : "/api/admin/agent-announcements";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }

      flash(editingId ? "更新しました" : "作成しました", true);
      resetForm();
      fetchAnnouncements();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), false);
    } finally {
      setBusy(false);
    }
  };

  /* ── Delete ── */

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/agent-announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      flash("削除しました", true);
      setDeleteTarget(null);
      fetchAnnouncements();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), false);
    } finally {
      setBusy(false);
    }
  };

  /* ── Edit start ── */

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      body: a.body,
      category: a.category,
      is_pinned: a.is_pinned,
      published_at: toLocalDatetime(a.published_at),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Reset ── */

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Flash message */}
      {msg && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            msg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">{loading ? "読み込み中..." : `${announcements.length} 件`}</p>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-inverse shadow-sm hover:bg-primary/90 transition-colors"
          >
            新規作成
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border-default bg-surface p-6 shadow-sm space-y-4"
        >
          <h3 className="text-base font-semibold text-primary">{editingId ? "お知らせ編集" : "新規お知らせ"}</h3>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              タイトル <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="お知らせタイトル"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">本文</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={5}
              className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"
              placeholder="お知らせ本文"
            />
          </div>

          {/* Category + Pinned row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">カテゴリ</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">公開日時</label>
              <input
                type="datetime-local"
                value={form.published_at}
                onChange={(e) => setForm({ ...form, published_at: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Pinned */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
              className="rounded border-border-default text-primary focus:ring-primary"
            />
            <span className="text-secondary">ピン留め（上部に固定表示）</span>
          </label>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-inverse shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy ? "処理中..." : editingId ? "更新" : "作成"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-border-default px-5 py-2 text-sm font-medium text-secondary hover:bg-surface-hover transition-colors"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-20 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface p-8 text-center text-sm text-secondary">
          お知らせはまだありません
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const cat = CATEGORY_MAP[a.category] ?? CATEGORY_MAP.general;
            return (
              <div key={a.id} className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  {/* Left */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={cat.variant}>{cat.label}</Badge>
                      {a.is_pinned && <Badge variant="violet">ピン留め</Badge>}
                      <h4 className="text-sm font-semibold text-primary truncate">{a.title}</h4>
                    </div>
                    {a.body && <p className="text-xs text-secondary line-clamp-2 whitespace-pre-wrap">{a.body}</p>}
                    <div className="flex items-center gap-4 text-[11px] text-tertiary">
                      <span>公開: {formatDateTime(a.published_at)}</span>
                      <span>作成: {formatDateTime(a.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover transition-colors"
                    >
                      編集
                    </button>
                    {deleteTarget === a.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(a.id)}
                          disabled={busy}
                          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-50"
                        >
                          削除する
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(null)}
                          className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover transition-colors"
                        >
                          戻す
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(a.id)}
                        className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-dim transition-colors"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
