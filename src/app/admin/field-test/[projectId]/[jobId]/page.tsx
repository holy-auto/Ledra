"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ── Types ──

type Condition = {
  id: string;
  label: string;
  description: string | null;
  check_type: string;
  numeric_min: number | null;
  numeric_max: number | null;
  unit: string | null;
  is_required: boolean;
  sort_order: number;
};

type ConditionCheck = {
  id: string;
  condition_id: string;
  value_boolean: boolean | null;
  value_numeric: number | null;
  value_text: string | null;
  value_photo_path: string | null;
  checked_at: string;
};

type Evidence = {
  id: string;
  evidence_type: string;
  file_name: string | null;
  content_type: string | null;
  caption: string | null;
  captured_at: string | null;
  created_at: string;
  signed_url: string | null;
};

type Inspection = {
  id: string;
  result: string;
  score: number | null;
  notes: string | null;
  inspected_at: string | null;
  created_at: string;
};

type Defect = {
  id: string;
  defect_code: string | null;
  title: string;
  severity: string;
  status: string;
  description: string | null;
  resolution: string | null;
  created_at: string;
};

type JobDetail = {
  id: string;
  job_code: string | null;
  title: string;
  description: string | null;
  status: string;
  conditions_snapshot: Record<string, unknown>;
  assigned_at: string;
  completed_at: string | null;
  conditions: Condition[];
  condition_checks: ConditionCheck[];
  evidence: Evidence[];
  inspections: Inspection[];
  defects: Defect[];
};

// ── Labels ──

const STATUS_JA: Record<string, string> = {
  assigned: "割当済", in_progress: "施工中", evidence_submitted: "証拠提出済",
  inspection: "検査中", completed: "完了", rejected: "差戻し",
};
const RESULT_JA: Record<string, string> = {
  pending: "未検査", pass: "合格", fail: "不合格", conditional_pass: "条件付合格",
};
const SEV_JA: Record<string, string> = { low: "軽微", medium: "中", high: "重大", critical: "致命的" };
const DEF_ST_JA: Record<string, string> = { open: "未対応", investigating: "調査中", resolved: "解決済", closed: "クローズ", wontfix: "対応不要" };
const EVT_JA: Record<string, string> = {
  photo_before: "施工前", photo_during: "施工中", photo_after: "施工後",
  measurement: "計測", env_data: "環境", video: "動画", document: "書類", other: "その他",
};

const TABS = ["概要", "条件チェック", "証拠", "検査結果", "不具合"] as const;
type Tab = (typeof TABS)[number];

export default function FieldTestJobDetailPage() {
  const { projectId, jobId } = useParams<{ projectId: string; jobId: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("概要");
  const [acting, setActing] = useState(false);

  const fetchJob = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/field-test/jobs/${jobId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setJob(json.error ? null : json))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  const changeStatus = async (newStatus: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/field-test/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchJob();
      else alert((await res.json()).error ?? "エラーが発生しました");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-secondary">読み込み中...</div>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="p-6">
        <div className="text-sm text-secondary">案件が見つかりません。</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-2 text-xs text-secondary">
        <Link href="/admin/field-test" className="text-accent hover:underline">プロジェクト一覧</Link>
        <span>/</span>
        <Link href={`/admin/field-test/${projectId}`} className="text-accent hover:underline">案件一覧</Link>
        <span>/</span>
        <span className="text-muted">{job.title}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-primary">{job.title}</h1>
          {job.job_code && <span className="text-xs font-mono text-muted">{job.job_code}</span>}
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {job.status === "assigned" && (
          <button
            onClick={() => changeStatus("in_progress")}
            disabled={acting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            作業開始
          </button>
        )}
        {job.status === "in_progress" && (
          <button
            onClick={() => changeStatus("evidence_submitted")}
            disabled={acting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            証拠を提出
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            {t}
            {t === "証拠" && job.evidence.length > 0 && (
              <span className="ml-1 text-[10px] text-secondary">({job.evidence.length})</span>
            )}
            {t === "不具合" && job.defects.length > 0 && (
              <span className="ml-1 text-[10px] text-red-500">({job.defects.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "概要" && <OverviewSection job={job} />}
      {tab === "条件チェック" && (
        <ConditionChecksSection
          jobId={jobId}
          conditions={job.conditions}
          checks={job.condition_checks}
          editable={job.status === "in_progress"}
          onSaved={fetchJob}
        />
      )}
      {tab === "証拠" && (
        <EvidenceSection
          jobId={jobId}
          evidence={job.evidence}
          editable={job.status === "in_progress"}
          onUploaded={fetchJob}
        />
      )}
      {tab === "検査結果" && <InspectionsSection inspections={job.inspections} />}
      {tab === "不具合" && <DefectsSection defects={job.defects} />}
    </div>
  );
}

// ── Sub Components ──

function StatusBadge({ status }: { status: string }) {
  const COLOR: Record<string, string> = {
    assigned: "bg-blue-100 text-blue-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    evidence_submitted: "bg-purple-100 text-purple-800",
    inspection: "bg-orange-100 text-orange-800",
    completed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR[status] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_JA[status] ?? status}
    </span>
  );
}

function OverviewSection({ job }: { job: JobDetail }) {
  return (
    <div className="space-y-3">
      {job.description && (
        <div className="rounded-xl border border-border-subtle bg-surface p-4 text-sm text-secondary whitespace-pre-wrap">
          {job.description}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        <InfoCard label="ステータス" value={STATUS_JA[job.status] ?? job.status} />
        <InfoCard label="割当日" value={job.assigned_at?.slice(0, 10) ?? "-"} />
        <InfoCard label="完了日" value={job.completed_at?.slice(0, 10) ?? "-"} />
        <InfoCard label="条件チェック" value={`${job.condition_checks.length} / ${job.conditions.length}`} />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-primary">{value}</div>
    </div>
  );
}

function ConditionChecksSection({
  jobId,
  conditions,
  checks,
  editable,
  onSaved,
}: {
  jobId: string;
  conditions: Condition[];
  checks: ConditionCheck[];
  editable: boolean;
  onSaved: () => void;
}) {
  const checkMap = new Map(checks.map((c) => [c.condition_id, c]));
  const [saving, setSaving] = useState<string | null>(null);

  const saveCheck = async (conditionId: string, value: Record<string, unknown>) => {
    setSaving(conditionId);
    try {
      await fetch("/api/admin/field-test/condition-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, condition_id: conditionId, ...value }),
      });
      onSaved();
    } finally {
      setSaving(null);
    }
  };

  if (conditions.length === 0) {
    return <div className="text-sm text-muted">条件定義がありません。</div>;
  }

  return (
    <div className="space-y-2">
      {conditions.map((cond) => {
        const check = checkMap.get(cond.id);
        const done = !!check;
        return (
          <div key={cond.id} className={`rounded-xl border p-3 ${done ? "border-green-200 bg-green-50/50" : "border-border-subtle bg-surface"}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-primary">{cond.label}</span>
                {cond.is_required && <span className="ml-1 text-[10px] text-red-500">必須</span>}
                {cond.description && (
                  <div className="text-xs text-muted mt-0.5">{cond.description}</div>
                )}
              </div>
              {done && <span className="text-xs text-green-600 font-medium">✓</span>}
            </div>
            {editable && !done && cond.check_type === "boolean" && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => saveCheck(cond.id, { value_boolean: true })}
                  disabled={saving === cond.id}
                  className="rounded-lg bg-green-500 px-3 py-1 text-xs text-white hover:bg-green-600 disabled:opacity-50"
                >
                  OK
                </button>
                <button
                  onClick={() => saveCheck(cond.id, { value_boolean: false })}
                  disabled={saving === cond.id}
                  className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                >
                  NG
                </button>
              </div>
            )}
            {editable && !done && cond.check_type === "numeric" && (
              <NumericInput
                cond={cond}
                saving={saving === cond.id}
                onSave={(v) => saveCheck(cond.id, { value_numeric: v })}
              />
            )}
            {editable && !done && cond.check_type === "text" && (
              <TextInput
                saving={saving === cond.id}
                onSave={(v) => saveCheck(cond.id, { value_text: v })}
              />
            )}
            {done && (
              <div className="mt-1 text-xs text-secondary">
                {check.value_boolean != null ? (check.value_boolean ? "OK" : "NG") : ""}
                {check.value_numeric != null ? `${check.value_numeric}${cond.unit ?? ""}` : ""}
                {check.value_text ?? ""}
                <span className="ml-2 text-[10px] text-muted">{check.checked_at?.slice(0, 16).replace("T", " ")}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumericInput({ cond, saving, onSave }: { cond: Condition; saving: boolean; onSave: (v: number) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        min={cond.numeric_min ?? undefined}
        max={cond.numeric_max ?? undefined}
        placeholder={`${cond.numeric_min ?? ""}〜${cond.numeric_max ?? ""} ${cond.unit ?? ""}`}
        className="w-32 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-sm"
      />
      {cond.unit && <span className="text-xs text-muted">{cond.unit}</span>}
      <button
        onClick={() => { if (val) onSave(Number(val)); }}
        disabled={saving || !val}
        className="rounded-lg bg-accent px-3 py-1 text-xs text-white hover:bg-accent/90 disabled:opacity-50"
      >
        保存
      </button>
    </div>
  );
}

function TextInput({ saving, onSave }: { saving: boolean; onSave: (v: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-sm"
      />
      <button
        onClick={() => { if (val) onSave(val); }}
        disabled={saving || !val}
        className="rounded-lg bg-accent px-3 py-1 text-xs text-white hover:bg-accent/90 disabled:opacity-50"
      >
        保存
      </button>
    </div>
  );
}

function EvidenceSection({
  jobId,
  evidence,
  editable,
  onUploaded,
}: {
  jobId: string;
  evidence: Evidence[];
  editable: boolean;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [evType, setEvType] = useState("photo_before");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("job_id", jobId);
      fd.append("evidence_type", evType);
      const res = await fetch("/api/admin/field-test/evidence", { method: "POST", body: fd });
      if (res.ok) onUploaded();
      else alert((await res.json()).error ?? "アップロード失敗");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface p-3">
          <select
            value={evType}
            onChange={(e) => setEvType(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs"
          >
            {Object.entries(EVT_JA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
            {uploading ? "アップロード中..." : "ファイルを選択"}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept="image/*,video/mp4,application/pdf" />
          </label>
        </div>
      )}
      {evidence.length === 0 ? (
        <div className="text-sm text-muted">証拠データはありません。</div>
      ) : (
        <div className="space-y-1.5">
          {evidence.map((ev) => {
            const isImage = ev.content_type?.startsWith("image/");
            return (
              <div key={ev.id} className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface p-3">
                {ev.signed_url && isImage ? (
                  <a href={ev.signed_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ev.signed_url} alt={ev.file_name ?? ""} className="h-14 w-14 rounded-lg object-cover border border-border-subtle" />
                  </a>
                ) : ev.signed_url ? (
                  <a href={ev.signed_url} target="_blank" rel="noopener noreferrer" className="shrink-0 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-[10px] text-accent hover:bg-gray-200">
                    開く
                  </a>
                ) : (
                  <div className="shrink-0 h-14 w-14 rounded-lg bg-gray-100" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-secondary">
                    {EVT_JA[ev.evidence_type] ?? ev.evidence_type}
                  </span>
                  <div className="mt-1 text-xs text-primary truncate">{ev.file_name ?? "ファイル"}</div>
                  {ev.caption && <div className="text-[10px] text-muted truncate">{ev.caption}</div>}
                </div>
                <span className="text-[10px] text-secondary shrink-0">
                  {ev.created_at?.slice(0, 10)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InspectionsSection({ inspections }: { inspections: Inspection[] }) {
  if (inspections.length === 0) return <div className="text-sm text-muted">検査結果はまだありません。</div>;

  const RESULT_COLOR: Record<string, string> = {
    pass: "bg-green-100 text-green-800",
    fail: "bg-red-100 text-red-800",
    conditional_pass: "bg-yellow-100 text-yellow-800",
    pending: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-2">
      {inspections.map((ins) => (
        <div key={ins.id} className="rounded-xl border border-border-subtle bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[ins.result] ?? "bg-gray-100"}`}>
              {RESULT_JA[ins.result] ?? ins.result}
            </span>
            {ins.score != null && <span className="text-sm font-bold text-primary">{ins.score}点</span>}
            <span className="text-[10px] text-secondary ml-auto">{ins.inspected_at?.slice(0, 10) ?? ins.created_at?.slice(0, 10)}</span>
          </div>
          {ins.notes && <div className="mt-2 text-xs text-secondary whitespace-pre-wrap">{ins.notes}</div>}
        </div>
      ))}
    </div>
  );
}

function DefectsSection({ defects }: { defects: Defect[] }) {
  if (defects.length === 0) return <div className="text-sm text-muted">不具合は報告されていません。</div>;

  return (
    <div className="space-y-2">
      {defects.map((d) => (
        <div key={d.id} className="rounded-xl border border-border-subtle bg-surface p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {d.defect_code && <span className="text-[10px] font-mono text-muted">{d.defect_code}</span>}
                <span className="text-sm font-medium text-primary">{d.title}</span>
              </div>
              {d.description && <div className="mt-1 text-xs text-muted line-clamp-2">{d.description}</div>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                {SEV_JA[d.severity] ?? d.severity}
              </span>
              <span className="text-[10px] text-secondary">
                {DEF_ST_JA[d.status] ?? d.status}
              </span>
            </div>
          </div>
          {d.resolution && (
            <div className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-800">
              解決: {d.resolution}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
