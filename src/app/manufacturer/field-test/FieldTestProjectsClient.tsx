"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FtProjectStatus } from "@/types/manufacturer";
import { FT_PROJECT_STATUS_LABELS } from "@/types/manufacturer";

type Project = {
  id: string;
  name: string;
  product_name: string | null;
  status: FtProjectStatus;
  target_units: number | null;
  budget: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const STATUS_FILTERS: Array<{ value: FtProjectStatus | "all"; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "recruiting", label: "募集中" },
  { value: "active", label: "実施中" },
  { value: "completed", label: "完了" },
  { value: "archived", label: "アーカイブ" },
];

const STATUS_COLORS: Record<FtProjectStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  recruiting: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  completed: "bg-violet-100 text-violet-700",
  archived: "bg-gray-100 text-gray-500",
};

export default function FieldTestProjectsClient({ isAdmin }: { isAdmin: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FtProjectStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    fetch(`/api/manufacturer/field-test/projects?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.message ?? "取得に失敗しました。");
        setProjects(json.projects ?? []);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.value ? "bg-accent-dim text-accent" : "text-secondary hover:bg-surface-hover"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <Link
            href="/manufacturer/field-test/new"
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
          >
            新規プロジェクト
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-danger-border bg-danger-dim p-4 text-sm text-danger-text">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center text-sm text-secondary">
          プロジェクトがありません。
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/manufacturer/field-test/${p.id}`}
              className="block rounded-2xl border border-border-subtle bg-surface p-5 transition-colors hover:border-accent/30"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-primary">{p.name}</div>
                  {p.product_name && <div className="text-xs text-secondary">製品: {p.product_name}</div>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[p.status]}`}
                >
                  {FT_PROJECT_STATUS_LABELS[p.status]}
                </span>
              </div>
              <div className="mt-3 flex gap-6 text-xs text-muted">
                {p.target_units != null && <span>目標: {p.target_units}台</span>}
                {p.budget != null && <span>予算: {Number(p.budget).toLocaleString("ja-JP")}円</span>}
                {p.starts_at && <span>開始: {p.starts_at}</span>}
                {p.ends_at && <span>終了: {p.ends_at}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
