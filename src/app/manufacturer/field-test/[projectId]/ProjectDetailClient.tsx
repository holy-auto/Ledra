"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { FtProjectStatus } from "@/types/manufacturer";
import { FT_PROJECT_STATUS_LABELS } from "@/types/manufacturer";
import OverviewTab from "./tabs/OverviewTab";
import RecruitmentTab from "./tabs/RecruitmentTab";
import ApplicationsTab from "./tabs/ApplicationsTab";
import AgreementsTab from "./tabs/AgreementsTab";
import TrainingTab from "./tabs/TrainingTab";
import JobsTab from "./tabs/JobsTab";
import EvidenceTab from "./tabs/EvidenceTab";
import InspectionsTab from "./tabs/InspectionsTab";
import DefectsTab from "./tabs/DefectsTab";
import AnalyticsTab from "./tabs/AnalyticsTab";

type Project = {
  id: string;
  name: string;
  description: string | null;
  product_name: string | null;
  product_spec: Record<string, unknown>;
  budget: number | null;
  target_units: number | null;
  conditions: Record<string, unknown>;
  status: FtProjectStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const TABS = [
  { key: "overview", label: "概要" },
  { key: "recruitment", label: "募集" },
  { key: "applications", label: "応募" },
  { key: "agreements", label: "契約" },
  { key: "training", label: "教育" },
  { key: "jobs", label: "案件" },
  { key: "evidence", label: "証拠" },
  { key: "inspections", label: "品質検査" },
  { key: "defects", label: "不具合" },
  { key: "analytics", label: "分析" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProjectDetailClient({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.message ?? "読み込みに失敗しました。");
        setProject(json.project);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました。"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(reload, [reload]);

  if (error) {
    return (
      <div className="rounded-md border border-danger-border bg-danger-dim p-4 text-sm text-danger-text">{error}</div>
    );
  }
  if (loading || !project) {
    return <div className="text-sm text-secondary">読み込み中...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/manufacturer/field-test" className="text-xs text-accent hover:underline">
            ← プロジェクト一覧
          </Link>
          <h1 className="mt-1 text-xl font-bold text-primary">{project.name}</h1>
          {project.product_name && (
            <p className="mt-0.5 text-sm text-secondary">製品: {project.product_name}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            project.status === "active"
              ? "bg-green-100 text-green-700"
              : project.status === "recruiting"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {FT_PROJECT_STATUS_LABELS[project.status]}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border-subtle pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-accent text-accent"
                : "text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "overview" && <OverviewTab project={project} isAdmin={isAdmin} onUpdate={reload} />}
        {tab === "recruitment" && <RecruitmentTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "applications" && <ApplicationsTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "agreements" && <AgreementsTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "training" && <TrainingTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "jobs" && <JobsTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "evidence" && <EvidenceTab projectId={projectId} />}
        {tab === "inspections" && <InspectionsTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "defects" && <DefectsTab projectId={projectId} isAdmin={isAdmin} />}
        {tab === "analytics" && <AnalyticsTab projectId={projectId} />}
      </div>
    </div>
  );
}
