"use client";

import { useEffect, useState } from "react";

type Recruitment = {
  id: string;
  title: string;
  description: string | null;
  max_participants: number | null;
  deadline: string | null;
  is_open: boolean;
  created_at: string;
};

export default function RecruitmentTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Recruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/recruitments?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.recruitments ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/manufacturer/field-test/recruitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: fd.get("title"),
        description: fd.get("description") || undefined,
        max_participants: fd.get("max_participants") ? Number(fd.get("max_participants")) : undefined,
        deadline: fd.get("deadline") || undefined,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      load();
    }
    setSaving(false);
  };

  const toggleOpen = async (id: string, isOpen: boolean) => {
    await fetch(`/api/manufacturer/field-test/recruitments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_open: !isOpen }),
    });
    load();
  };

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
          >
            {showForm ? "閉じる" : "募集を作成"}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <input name="title" required placeholder="募集タイトル" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <textarea name="description" placeholder="募集要件" rows={2} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <div className="flex gap-3">
            <input name="max_participants" type="number" placeholder="募集上限" className="w-40 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
            <input name="deadline" type="datetime-local" className="w-56 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "作成中..." : "作成"}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          募集がありません。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border-subtle bg-surface p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-primary">{r.title}</div>
                {r.description && <p className="mt-0.5 text-xs text-secondary line-clamp-2">{r.description}</p>}
                <div className="mt-1 flex gap-4 text-xs text-muted">
                  {r.max_participants != null && <span>上限: {r.max_participants}社</span>}
                  {r.deadline && <span>締切: {new Date(r.deadline).toLocaleString("ja-JP")}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.is_open ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {r.is_open ? "受付中" : "締切"}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => toggleOpen(r.id, r.is_open)}
                    className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover"
                  >
                    {r.is_open ? "締切る" : "再開"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
