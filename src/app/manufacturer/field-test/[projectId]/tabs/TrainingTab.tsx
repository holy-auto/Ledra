"use client";

import { useEffect, useState } from "react";

type Module = {
  id: string;
  title: string;
  description: string | null;
  content_url: string | null;
  sort_order: number;
  is_required: boolean;
};

type Completion = {
  id: string;
  module_id: string;
  tenant_id: string;
  tenant_name: string | null;
  module_title: string | null;
  completed_at: string;
};

export default function TrainingTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [modules, setModules] = useState<Module[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/manufacturer/field-test/training?project_id=${projectId}`, { cache: "no-store" }).then((r) =>
        r.json(),
      ),
      fetch(`/api/manufacturer/field-test/training/completions?project_id=${projectId}`, { cache: "no-store" }).then(
        (r) => r.json(),
      ),
    ])
      .then(([mJson, cJson]) => {
        setModules(mJson.modules ?? []);
        setCompletions(cJson.completions ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/manufacturer/field-test/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: fd.get("title"),
        description: fd.get("description") || undefined,
        content_url: fd.get("content_url") || undefined,
        is_required: fd.get("is_required") === "on",
      }),
    });
    setShowForm(false);
    setSaving(false);
    load();
  };

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  return (
    <div className="space-y-6">
      {/* Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary">教育モジュール</h3>
          {isAdmin && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
            >
              {showForm ? "閉じる" : "追加"}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
            <input
              name="title"
              required
              placeholder="モジュール名"
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              placeholder="説明"
              rows={2}
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
            />
            <input
              name="content_url"
              placeholder="資料URL"
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs text-secondary">
              <input name="is_required" type="checkbox" defaultChecked /> 必修
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "追加"}
            </button>
          </form>
        )}

        {modules.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
            教育モジュールがありません。
          </div>
        ) : (
          modules.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-primary">{m.title}</span>
                {m.is_required && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">必修</span>
                )}
              </div>
              {m.description && <p className="mt-0.5 text-xs text-secondary">{m.description}</p>}
              {m.content_url && (
                <a
                  href={m.content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-accent hover:underline"
                >
                  資料を開く →
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* Completions */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary">受講状況</h3>
        {completions.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
            受講記録がありません。
          </div>
        ) : (
          <div className="rounded-2xl border border-border-subtle bg-surface divide-y divide-border-subtle">
            {completions.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <span className="text-sm text-primary">{c.tenant_name ?? c.tenant_id}</span>
                  <span className="ml-2 text-xs text-muted">{c.module_title}</span>
                </div>
                <span className="text-xs text-muted">{new Date(c.completed_at).toLocaleDateString("ja-JP")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
