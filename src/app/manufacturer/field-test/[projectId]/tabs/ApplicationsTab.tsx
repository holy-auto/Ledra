"use client";

import { useEffect, useState } from "react";
import { FT_APPLICATION_STATUS_LABELS } from "@/types/manufacturer";
import type { FtApplicationStatus } from "@/types/manufacturer";

type Application = {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  status: FtApplicationStatus;
  notes: string | null;
  review_notes: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<FtApplicationStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-500",
};

export default function ApplicationsTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/applications?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.applications ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const review = async (id: string, status: "approved" | "rejected") => {
    const notes = status === "rejected" ? prompt("却下理由を入力してください:") : undefined;
    if (status === "rejected" && notes === null) return;
    await fetch(`/api/manufacturer/field-test/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, review_notes: notes || undefined }),
    });
    load();
  };

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          応募がありません。
        </div>
      ) : (
        items.map((a) => (
          <div
            key={a.id}
            className="rounded-2xl border border-border-subtle bg-surface p-4 flex items-center justify-between gap-4"
          >
            <div>
              <div className="text-sm font-medium text-primary">{a.tenant_name ?? "(テナント名なし)"}</div>
              {a.notes && <p className="mt-0.5 text-xs text-secondary">{a.notes}</p>}
              {a.review_notes && <p className="mt-0.5 text-xs text-muted">審査メモ: {a.review_notes}</p>}
              <div className="mt-1 text-xs text-muted">
                応募日: {new Date(a.created_at).toLocaleDateString("ja-JP")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[a.status]}`}>
                {FT_APPLICATION_STATUS_LABELS[a.status]}
              </span>
              {isAdmin && a.status === "pending" && (
                <>
                  <button
                    onClick={() => review(a.id, "approved")}
                    className="rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-700"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => review(a.id, "rejected")}
                    className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700"
                  >
                    却下
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
