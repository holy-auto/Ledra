"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { FtJobStatus, FtEvidenceType, FtInspectionResult } from "@/types/manufacturer";
import { FT_JOB_STATUS_LABELS, FT_EVIDENCE_TYPE_LABELS, FT_INSPECTION_RESULT_LABELS } from "@/types/manufacturer";

type Job = {
  id: string;
  job_code: string | null;
  title: string;
  description: string | null;
  status: FtJobStatus;
  tenant_id: string;
  tenant_name: string | null;
  assigned_at: string;
  completed_at: string | null;
};

type ConditionCheck = {
  id: string;
  condition_id: string;
  label: string;
  check_type: string;
  value_boolean: boolean | null;
  value_numeric: number | null;
  value_text: string | null;
  checked_at: string | null;
};

type Evidence = {
  id: string;
  evidence_type: FtEvidenceType;
  file_name: string | null;
  caption: string | null;
  created_at: string;
};

type Inspection = {
  id: string;
  result: FtInspectionResult;
  score: number | null;
  notes: string | null;
  created_at: string;
};

const STATUS_FLOW: FtJobStatus[] = ["assigned", "in_progress", "evidence_submitted", "inspection", "completed"];

export default function JobDetailClient({
  projectId,
  jobId,
  isAdmin,
}: {
  projectId: string;
  jobId: string;
  isAdmin: boolean;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [checks, setChecks] = useState<ConditionCheck[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/jobs/${jobId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.message ?? "読み込みに失敗しました。");
        setJob(json.job);
        setChecks(json.condition_checks ?? []);
        setEvidence(json.evidence ?? []);
        setInspections(json.inspections ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました。"))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(load, [load]);

  const advanceStatus = async (nextStatus: FtJobStatus) => {
    await fetch(`/api/manufacturer/field-test/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    load();
  };

  const addEvidence = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/manufacturer/field-test/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        evidence_type: fd.get("evidence_type"),
        caption: fd.get("caption") || undefined,
        file_name: fd.get("file_name") || undefined,
      }),
    });
    e.currentTarget.reset();
    load();
  };

  const addInspection = async () => {
    await fetch("/api/manufacturer/field-test/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });
    load();
  };

  if (error) {
    return (
      <div className="rounded-md border border-danger-border bg-danger-dim p-4 text-sm text-danger-text">{error}</div>
    );
  }
  if (loading || !job) return <div className="text-sm text-secondary">読み込み中...</div>;

  const currentIdx = STATUS_FLOW.indexOf(job.status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href={`/manufacturer/field-test/${projectId}`} className="text-xs text-accent hover:underline">
          ← プロジェクト詳細
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-lg font-bold text-primary">
            {job.job_code && <span className="text-muted mr-1">[{job.job_code}]</span>}
            {job.title}
          </h1>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {FT_JOB_STATUS_LABELS[job.status]}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-secondary">テナント: {job.tenant_name ?? job.tenant_id}</p>
      </div>

      {/* Status action */}
      {isAdmin && nextStatus && (
        <button
          onClick={() => advanceStatus(nextStatus)}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
        >
          「{FT_JOB_STATUS_LABELS[nextStatus]}」に進める
        </button>
      )}

      {/* Condition checks */}
      <Section title="施工条件チェック">
        {checks.length === 0 ? (
          <p className="text-xs text-muted">施工条件が未定義です。</p>
        ) : (
          <div className="space-y-2">
            {checks.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle px-3 py-2"
              >
                <span className="text-sm text-primary">{c.label}</span>
                <span className="text-xs text-muted">
                  {c.value_boolean != null ? (c.value_boolean ? "OK" : "NG") : ""}
                  {c.value_numeric != null ? c.value_numeric : ""}
                  {c.value_text ?? ""}
                  {c.checked_at == null && "未入力"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Evidence */}
      <Section title="証拠データ">
        {evidence.length > 0 && (
          <div className="space-y-1 mb-3">
            {evidence.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle px-3 py-2"
              >
                <span className="text-sm text-primary">{ev.caption ?? ev.file_name ?? "証拠"}</span>
                <span className="text-xs text-muted">{FT_EVIDENCE_TYPE_LABELS[ev.evidence_type]}</span>
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <form onSubmit={addEvidence} className="flex gap-2 items-end">
            <select
              name="evidence_type"
              required
              className="rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
            >
              {(
                [
                  "photo_before",
                  "photo_during",
                  "photo_after",
                  "measurement",
                  "env_data",
                  "video",
                  "document",
                  "other",
                ] as FtEvidenceType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {FT_EVIDENCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              name="caption"
              placeholder="説明"
              className="flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
            />
            <input
              name="file_name"
              placeholder="ファイル名"
              className="w-32 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
            />
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
              追加
            </button>
          </form>
        )}
      </Section>

      {/* Inspections */}
      <Section title="品質検査">
        {inspections.length > 0 && (
          <div className="space-y-1 mb-3">
            {inspections.map((ins) => (
              <div
                key={ins.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{FT_INSPECTION_RESULT_LABELS[ins.result]}</span>
                  {ins.score != null && <span className="text-xs text-muted">{ins.score}点</span>}
                </div>
                {ins.notes && <span className="text-xs text-secondary truncate max-w-xs">{ins.notes}</span>}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <button onClick={addInspection} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
            検査を追加
          </button>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <h3 className="text-xs font-semibold text-muted mb-3">{title}</h3>
      {children}
    </div>
  );
}
