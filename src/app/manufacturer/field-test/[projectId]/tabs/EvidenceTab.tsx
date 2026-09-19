"use client";

import { useEffect, useState } from "react";
import { FT_EVIDENCE_TYPE_LABELS } from "@/types/manufacturer";
import type { FtEvidenceType } from "@/types/manufacturer";

type Evidence = {
  id: string;
  job_id: string;
  evidence_type: FtEvidenceType;
  file_name: string | null;
  caption: string | null;
  captured_at: string | null;
  created_at: string;
};

export default function EvidenceTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/manufacturer/field-test/evidence?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.evidence ?? []))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          証拠データがありません。案件詳細画面から証拠を追加してください。
        </div>
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-surface divide-y divide-border-subtle">
          {items.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <span className="text-sm text-primary">{e.caption ?? e.file_name ?? "証拠データ"}</span>
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {FT_EVIDENCE_TYPE_LABELS[e.evidence_type]}
                </span>
              </div>
              <span className="text-xs text-muted">
                {e.captured_at ? new Date(e.captured_at).toLocaleDateString("ja-JP") : new Date(e.created_at).toLocaleDateString("ja-JP")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
