"use client";

import { useState } from "react";
import type { FtProjectStatus } from "@/types/manufacturer";
import { FT_PROJECT_STATUS_LABELS } from "@/types/manufacturer";

type Project = {
  id: string;
  name: string;
  description: string | null;
  product_name: string | null;
  budget: number | null;
  target_units: number | null;
  status: FtProjectStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const STATUS_FLOW: FtProjectStatus[] = ["draft", "recruiting", "active", "completed", "archived"];

export default function OverviewTab({
  project,
  isAdmin,
  onUpdate,
}: {
  project: Project;
  isAdmin: boolean;
  onUpdate: () => void;
}) {
  const [advancing, setAdvancing] = useState(false);

  const currentIdx = STATUS_FLOW.indexOf(project.status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  const advanceStatus = async () => {
    if (!nextStatus) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/manufacturer/field-test/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.message ?? "更新に失敗しました。");
      } else {
        onUpdate();
      }
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ステータス" value={FT_PROJECT_STATUS_LABELS[project.status]} />
        <Stat label="目標施工台数" value={project.target_units != null ? `${project.target_units} 台` : "-"} />
        <Stat
          label="予算"
          value={project.budget != null ? `${Number(project.budget).toLocaleString("ja-JP")} 円` : "-"}
        />
        <Stat
          label="期間"
          value={project.starts_at && project.ends_at ? `${project.starts_at} 〜 ${project.ends_at}` : "-"}
        />
      </div>

      {/* Description */}
      {project.description && (
        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="text-xs font-medium text-muted mb-1">概要</div>
          <p className="text-sm text-primary whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      {/* Status flow */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-4">
        <div className="text-xs font-medium text-muted mb-3">ステータスフロー</div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  s === project.status
                    ? "bg-accent text-white"
                    : i < currentIdx
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {FT_PROJECT_STATUS_LABELS[s]}
              </span>
              {i < STATUS_FLOW.length - 1 && <span className="text-muted text-xs">→</span>}
            </div>
          ))}
        </div>

        {isAdmin && nextStatus && (
          <button
            onClick={advanceStatus}
            disabled={advancing}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {advancing ? "更新中..." : `「${FT_PROJECT_STATUS_LABELS[nextStatus]}」に進める`}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-primary">{value}</div>
    </div>
  );
}
