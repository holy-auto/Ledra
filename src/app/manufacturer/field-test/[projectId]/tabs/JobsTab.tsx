"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FtJobStatus } from "@/types/manufacturer";
import { FT_JOB_STATUS_LABELS } from "@/types/manufacturer";

type Job = {
  id: string;
  job_code: string | null;
  title: string;
  tenant_id: string;
  tenant_name: string | null;
  status: FtJobStatus;
  assigned_at: string;
  completed_at: string | null;
};

const STATUS_COLORS: Record<FtJobStatus, string> = {
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  evidence_submitted: "bg-purple-100 text-purple-700",
  inspection: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function JobsTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/jobs?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.jobs ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/manufacturer/field-test/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        tenant_id: fd.get("tenant_id"),
        title: fd.get("title"),
        description: fd.get("description") || undefined,
        job_code: fd.get("job_code") || undefined,
      }),
    });
    setShowForm(false);
    setSaving(false);
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
            {showForm ? "閉じる" : "案件を割当"}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <input name="tenant_id" required placeholder="テナントID (UUID)" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <input name="title" required placeholder="案件名" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <input name="job_code" placeholder="管理番号" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <textarea name="description" placeholder="説明" rows={2} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "割当中..." : "割当"}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          案件がありません。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((j) => (
            <Link
              key={j.id}
              href={`/manufacturer/field-test/${projectId}/jobs/${j.id}`}
              className="block rounded-2xl border border-border-subtle bg-surface p-4 transition-colors hover:border-accent/30"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-primary">
                    {j.job_code && <span className="text-muted mr-1">[{j.job_code}]</span>}
                    {j.title}
                  </div>
                  <div className="mt-0.5 text-xs text-secondary">{j.tenant_name ?? j.tenant_id}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[j.status]}`}>
                  {FT_JOB_STATUS_LABELS[j.status]}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted">
                割当日: {new Date(j.assigned_at).toLocaleDateString("ja-JP")}
                {j.completed_at && ` · 完了日: ${new Date(j.completed_at).toLocaleDateString("ja-JP")}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
