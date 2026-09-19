"use client";

import { useEffect, useState } from "react";
import { FT_INSPECTION_RESULT_LABELS } from "@/types/manufacturer";
import type { FtInspectionResult } from "@/types/manufacturer";

type Inspection = {
  id: string;
  job_id: string;
  result: FtInspectionResult;
  score: number | null;
  notes: string | null;
  inspected_at: string | null;
  created_at: string;
};

const RESULT_COLORS: Record<FtInspectionResult, string> = {
  pending: "bg-gray-100 text-gray-600",
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  conditional_pass: "bg-yellow-100 text-yellow-700",
};

export default function InspectionsTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/inspections?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.inspections ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const updateResult = async (id: string, result: FtInspectionResult) => {
    await fetch(`/api/manufacturer/field-test/inspections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, inspected_at: new Date().toISOString() }),
    });
    load();
  };

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          品質検査がありません。案件詳細画面から検査を記録してください。
        </div>
      ) : (
        items.map((ins) => (
          <div key={ins.id} className="rounded-2xl border border-border-subtle bg-surface p-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RESULT_COLORS[ins.result]}`}>
                  {FT_INSPECTION_RESULT_LABELS[ins.result]}
                </span>
                {ins.score != null && <span className="text-sm font-semibold text-primary">{ins.score}点</span>}
              </div>
              {ins.notes && <p className="mt-1 text-xs text-secondary">{ins.notes}</p>}
              <div className="mt-1 text-xs text-muted">
                {ins.inspected_at ? `検査日: ${new Date(ins.inspected_at).toLocaleDateString("ja-JP")}` : `作成日: ${new Date(ins.created_at).toLocaleDateString("ja-JP")}`}
              </div>
            </div>
            {isAdmin && ins.result === "pending" && (
              <div className="flex gap-1">
                <button onClick={() => updateResult(ins.id, "pass")} className="rounded-lg bg-green-600 px-2 py-1 text-[11px] font-medium text-white">合格</button>
                <button onClick={() => updateResult(ins.id, "conditional_pass")} className="rounded-lg bg-yellow-600 px-2 py-1 text-[11px] font-medium text-white">条件付</button>
                <button onClick={() => updateResult(ins.id, "fail")} className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-medium text-white">不合格</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
