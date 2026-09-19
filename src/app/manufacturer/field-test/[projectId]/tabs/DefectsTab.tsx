"use client";

import { useEffect, useState } from "react";
import { FT_DEFECT_SEVERITY_LABELS, FT_DEFECT_STATUS_LABELS } from "@/types/manufacturer";
import type { FtDefectSeverity, FtDefectStatus } from "@/types/manufacturer";

type Defect = {
  id: string;
  defect_code: string | null;
  title: string;
  description: string | null;
  severity: FtDefectSeverity;
  status: FtDefectStatus;
  resolution: string | null;
  tenant_id: string | null;
  created_at: string;
};

const SEV_COLORS: Record<FtDefectSeverity, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export default function DefectsTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/defects?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.defects ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/manufacturer/field-test/defects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: fd.get("title"),
        description: fd.get("description") || undefined,
        severity: fd.get("severity") || "medium",
        defect_code: fd.get("defect_code") || undefined,
      }),
    });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const updateStatus = async (id: string, status: FtDefectStatus) => {
    const resolution = status === "resolved" ? prompt("解決内容を入力してください:") : undefined;
    if (status === "resolved" && resolution === null) return;
    await fetch(`/api/manufacturer/field-test/defects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution: resolution || undefined }),
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
            {showForm ? "閉じる" : "不具合を報告"}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <input name="title" required placeholder="不具合タイトル" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <input name="defect_code" placeholder="不具合コード" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <textarea name="description" placeholder="詳細" rows={3} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <select name="severity" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm">
            <option value="low">軽微</option>
            <option value="medium" selected>中</option>
            <option value="high">重大</option>
            <option value="critical">致命的</option>
          </select>
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "保存中..." : "報告"}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          不具合報告がありません。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {d.defect_code && <span className="text-xs text-muted">[{d.defect_code}]</span>}
                    <span className="text-sm font-medium text-primary">{d.title}</span>
                  </div>
                  {d.description && <p className="mt-1 text-xs text-secondary line-clamp-2">{d.description}</p>}
                  {d.resolution && <p className="mt-1 text-xs text-green-700">解決: {d.resolution}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEV_COLORS[d.severity]}`}>
                    {FT_DEFECT_SEVERITY_LABELS[d.severity]}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                    {FT_DEFECT_STATUS_LABELS[d.status]}
                  </span>
                </div>
              </div>
              {isAdmin && (d.status === "open" || d.status === "investigating") && (
                <div className="mt-3 flex gap-1">
                  {d.status === "open" && (
                    <button onClick={() => updateStatus(d.id, "investigating")} className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover">
                      調査開始
                    </button>
                  )}
                  <button onClick={() => updateStatus(d.id, "resolved")} className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover">
                    解決
                  </button>
                  <button onClick={() => updateStatus(d.id, "wontfix")} className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover">
                    対応不要
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
