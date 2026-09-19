"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ── Types ──

type FtJob = {
  id: string;
  job_code: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_at: string;
  completed_at: string | null;
  created_at: string;
};

type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  content_url: string | null;
  sort_order: number;
  is_required: boolean;
  completion: { id: string; completed_at: string } | null;
};

type Agreement = {
  id: string;
  agreement_type: string;
  document_url: string | null;
  document_text: string | null;
  accepted: boolean;
  accepted_at: string | null;
  created_at: string;
};

// ── Labels ──

const STATUS_JA: Record<string, string> = {
  assigned: "割当済",
  in_progress: "施工中",
  evidence_submitted: "証拠提出済",
  inspection: "検査中",
  completed: "完了",
  rejected: "差戻し",
};

const STATUS_COLOR: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  evidence_submitted: "bg-purple-100 text-purple-800",
  inspection: "bg-orange-100 text-orange-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const AGREEMENT_TYPE_JA: Record<string, string> = {
  nda: "秘密保持契約",
  terms: "利用規約",
  other: "その他",
};

const TABS = ["案件", "教育", "契約"] as const;
type Tab = (typeof TABS)[number];

export default function FieldTestProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>("案件");
  const [jobs, setJobs] = useState<FtJob[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/field-test/jobs?project_id=${projectId}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/admin/field-test/training?project_id=${projectId}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/admin/field-test/agreements?project_id=${projectId}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([jobsRes, trainingRes, agreementsRes]) => {
        setJobs(jobsRes.jobs ?? []);
        setModules(trainingRes.modules ?? []);
        setAgreements(agreementsRes.agreements ?? []);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleComplete = useCallback(async (moduleId: string) => {
    const res = await fetch("/api/admin/field-test/training/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module_id: moduleId }),
    });
    if (res.ok) {
      const json = await res.json();
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId ? { ...m, completion: json } : m,
        ),
      );
    }
  }, []);

  const handleAccept = useCallback(async (agreementId: string) => {
    if (!confirm("この契約に同意しますか？")) return;
    const res = await fetch(`/api/admin/field-test/agreements/${agreementId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      const json = await res.json();
      setAgreements((prev) =>
        prev.map((a) =>
          a.id === agreementId
            ? { ...a, accepted: true, accepted_at: json.accepted_at }
            : a,
        ),
      );
    }
  }, []);

  const completedCount = modules.filter((m) => m.completion).length;
  const requiredCount = modules.filter((m) => m.is_required).length;
  const acceptedCount = agreements.filter((a) => a.accepted).length;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/admin/field-test" className="text-xs text-accent hover:underline">
          ← プロジェクト一覧
        </Link>
      </div>
      <h1 className="text-lg font-bold text-primary mb-4">プロジェクト詳細</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-primary"
            }`}
          >
            {t}
            {t === "教育" && modules.length > 0 && (
              <span className="ml-1 text-[10px] text-secondary">({completedCount}/{modules.length})</span>
            )}
            {t === "契約" && agreements.length > 0 && (
              <span className="ml-1 text-[10px] text-secondary">({acceptedCount}/{agreements.length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : (
        <>
          {tab === "案件" && <JobsTab jobs={jobs} projectId={projectId} />}
          {tab === "教育" && (
            <TrainingTab
              modules={modules}
              completedCount={completedCount}
              requiredCount={requiredCount}
              onComplete={handleComplete}
            />
          )}
          {tab === "契約" && (
            <AgreementsTab agreements={agreements} onAccept={handleAccept} />
          )}
        </>
      )}
    </div>
  );
}

// ── Tab Components ──

function JobsTab({ jobs, projectId }: { jobs: FtJob[]; projectId: string }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
        <div className="text-sm text-muted">案件はありません</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <Link
          key={j.id}
          href={`/admin/field-test/${projectId}/${j.id}`}
          className="block rounded-2xl border border-border-subtle bg-surface p-4 hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {j.job_code && (
                  <span className="text-[10px] font-mono text-muted bg-gray-100 rounded px-1.5 py-0.5">
                    {j.job_code}
                  </span>
                )}
                <span className="text-sm font-semibold text-primary truncate">{j.title}</span>
              </div>
              {j.description && (
                <div className="mt-1 text-xs text-muted line-clamp-1">{j.description}</div>
              )}
            </div>
            <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[j.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_JA[j.status] ?? j.status}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-secondary">
            割当日: {j.assigned_at?.slice(0, 10) ?? "-"}
            {j.completed_at && <span className="ml-3">完了日: {j.completed_at.slice(0, 10)}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}

function TrainingTab({
  modules,
  completedCount,
  requiredCount,
  onComplete,
}: {
  modules: TrainingModule[];
  completedCount: number;
  requiredCount: number;
  onComplete: (id: string) => void;
}) {
  if (modules.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
        <div className="text-sm text-muted">教育モジュールはありません</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <div className="text-xs text-secondary">
          受講済: {completedCount} / {modules.length}
        </div>
        {requiredCount > 0 && (
          <div className="text-xs text-secondary">
            必須: {modules.filter((m) => m.is_required && m.completion).length} / {requiredCount}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {modules.map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl border p-4 ${
              m.completion
                ? "border-green-200 bg-green-50"
                : "border-border-subtle bg-surface"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-primary">{m.title}</span>
                  {m.is_required && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      必須
                    </span>
                  )}
                </div>
                {m.description && (
                  <div className="mt-1 text-xs text-muted">{m.description}</div>
                )}
              </div>
              <div className="shrink-0">
                {m.completion ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                    受講済 ({m.completion.completed_at?.slice(0, 10)})
                  </span>
                ) : (
                  <button
                    onClick={() => onComplete(m.id)}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                  >
                    受講完了
                  </button>
                )}
              </div>
            </div>
            {m.content_url && (
              <div className="mt-2">
                <a
                  href={m.content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  教材を開く ↗
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgreementsTab({
  agreements,
  onAccept,
}: {
  agreements: Agreement[];
  onAccept: (id: string) => void;
}) {
  if (agreements.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
        <div className="text-sm text-muted">契約書はありません</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agreements.map((a) => (
        <div
          key={a.id}
          className={`rounded-2xl border p-4 ${
            a.accepted
              ? "border-green-200 bg-green-50"
              : "border-yellow-200 bg-yellow-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary">
                  {AGREEMENT_TYPE_JA[a.agreement_type] ?? a.agreement_type}
                </span>
                {a.accepted ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                    同意済
                  </span>
                ) : (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">
                    未同意
                  </span>
                )}
              </div>
              {a.document_text && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border-subtle bg-white p-3 text-xs text-secondary whitespace-pre-wrap">
                  {a.document_text}
                </div>
              )}
              {a.document_url && (
                <div className="mt-2">
                  <a
                    href={a.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    契約書を開く ↗
                  </a>
                </div>
              )}
            </div>
            <div className="shrink-0">
              {a.accepted ? (
                <div className="text-[10px] text-secondary">{a.accepted_at?.slice(0, 10)}</div>
              ) : (
                <button
                  onClick={() => onAccept(a.id)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                >
                  同意する
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
