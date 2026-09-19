"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──

type FtProject = {
  id: string;
  name: string;
  description: string | null;
  product_name: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type Recruitment = {
  id: string;
  title: string;
  description: string | null;
  required_certifications: string[];
  max_participants: number | null;
  deadline: string | null;
  is_open: boolean;
  created_at: string;
  project_id: string;
};

type Application = {
  id: string;
  status: string;
  notes: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  recruitment_id: string;
  project_id: string;
};

// ── Labels ──

const STATUS_JA: Record<string, string> = {
  draft: "下書き",
  recruiting: "募集中",
  active: "実施中",
  completed: "完了",
  archived: "アーカイブ",
};
const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  recruiting: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-600",
  draft: "bg-yellow-100 text-yellow-800",
  archived: "bg-gray-100 text-gray-500",
};
const APP_STATUS_JA: Record<string, string> = {
  pending: "審査中",
  approved: "承認",
  rejected: "却下",
  withdrawn: "取下げ",
};
const APP_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-gray-100 text-gray-500",
};

const TABS = ["参加中", "募集", "応募状況"] as const;
type Tab = (typeof TABS)[number];

export default function FieldTestPage() {
  const [tab, setTab] = useState<Tab>("参加中");
  const [projects, setProjects] = useState<FtProject[]>([]);
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/field-test/projects", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/field-test/recruitments", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/field-test/applications", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([pj, rec, app]) => {
        setProjects(pj.projects ?? []);
        setRecruitments(rec.recruitments ?? []);
        setApplications(app.applications ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const appliedRecruitmentIds = new Set(applications.map((a) => a.recruitment_id));

  const handleApply = async (recruitmentId: string) => {
    const notes = prompt("応募メモ（任意）:");
    const res = await fetch("/api/admin/field-test/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recruitment_id: recruitmentId, notes: notes || undefined }),
    });
    if (res.ok) {
      const json = await res.json();
      setApplications((prev) => [json, ...prev]);
    } else {
      const err = await res.json();
      alert(err.message ?? err.error ?? "応募に失敗しました");
    }
  };

  const handleWithdraw = async (appId: string) => {
    if (!confirm("応募を取り下げますか？")) return;
    const res = await fetch(`/api/admin/field-test/applications/${appId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    if (res.ok) {
      setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: "withdrawn" } : a)));
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-primary">実証テスト</h1>
        <Link
          href="/admin/field-test/workshop-profile"
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover transition-colors"
        >
          工場設備プロフィール
        </Link>
      </div>

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
            {t === "募集" && recruitments.length > 0 && (
              <span className="ml-1 text-[10px] text-secondary">({recruitments.length})</span>
            )}
            {t === "応募状況" && applications.length > 0 && (
              <span className="ml-1 text-[10px] text-secondary">({applications.length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : (
        <>
          {tab === "参加中" && <ProjectsTab projects={projects} />}
          {tab === "募集" && (
            <RecruitmentsTab recruitments={recruitments} appliedIds={appliedRecruitmentIds} onApply={handleApply} />
          )}
          {tab === "応募状況" && <ApplicationsTab applications={applications} onWithdraw={handleWithdraw} />}
        </>
      )}
    </div>
  );
}

// ── Tab Components ──

function ProjectsTab({ projects }: { projects: FtProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
        <div className="text-sm text-muted">参加中のプロジェクトはありません</div>
        <div className="mt-1 text-xs text-secondary">メーカーからの案件割当があるとここに表示されます</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/admin/field-test/${p.id}`}
          className="rounded-2xl border border-border-subtle bg-surface p-4 hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-primary truncate">{p.name}</div>
              {p.product_name && <div className="mt-0.5 text-xs text-secondary truncate">{p.product_name}</div>}
            </div>
            <span
              className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {STATUS_JA[p.status] ?? p.status}
            </span>
          </div>
          {p.description && <div className="mt-2 text-xs text-muted line-clamp-2">{p.description}</div>}
          {(p.starts_at || p.ends_at) && (
            <div className="mt-2 text-[10px] text-secondary">
              {p.starts_at ?? "?"} 〜 {p.ends_at ?? "?"}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

function RecruitmentsTab({
  recruitments,
  appliedIds,
  onApply,
}: {
  recruitments: Recruitment[];
  appliedIds: Set<string>;
  onApply: (id: string) => void;
}) {
  if (recruitments.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
        <div className="text-sm text-muted">公開中の募集はありません</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {recruitments.map((r) => {
        const applied = appliedIds.has(r.id);
        return (
          <div key={r.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-primary">{r.title}</div>
                {r.description && <div className="mt-1 text-xs text-muted line-clamp-2">{r.description}</div>}
              </div>
              {applied ? (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                  応募済
                </span>
              ) : (
                <button
                  onClick={() => onApply(r.id)}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                >
                  応募する
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-secondary">
              {r.deadline && <span>締切: {r.deadline.slice(0, 10)}</span>}
              {r.max_participants && <span>定員: {r.max_participants}社</span>}
              {r.required_certifications.length > 0 && <span>必要資格: {r.required_certifications.join(", ")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ApplicationsTab({
  applications,
  onWithdraw,
}: {
  applications: Application[];
  onWithdraw: (id: string) => void;
}) {
  if (applications.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
        <div className="text-sm text-muted">応募はありません</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {applications.map((a) => (
        <div key={a.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${APP_STATUS_COLOR[a.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {APP_STATUS_JA[a.status] ?? a.status}
            </span>
            <span className="text-[10px] text-secondary">{a.created_at?.slice(0, 10)}</span>
          </div>
          {a.notes && <div className="mt-1 text-xs text-muted">{a.notes}</div>}
          {a.review_notes && <div className="mt-1 text-xs text-secondary">レビュー: {a.review_notes}</div>}
          {a.status === "pending" && (
            <button onClick={() => onWithdraw(a.id)} className="mt-2 text-xs text-red-500 hover:underline">
              取り下げる
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
