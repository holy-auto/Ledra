"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Vehicle = {
  maker: string | null;
  model: string | null;
  plate_display: string | null;
};

type Job = {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  vehicle: Vehicle | null;
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  arrived: "受付済み",
  in_progress: "作業中",
  completed: "完了",
  cancelled: "キャンセル",
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  arrived: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  in_progress: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  completed: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatDate(value: string | null) {
  if (!value) return "日付未定";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ja-JP");
}

function vehicleLabel(v: Vehicle | null): string | null {
  if (!v) return null;
  const parts = [v.maker, v.model].filter(Boolean).join(" ");
  const plate = v.plate_display ? `（${v.plate_display}）` : "";
  const label = `${parts}${plate}`.trim();
  return label || null;
}

function PortalJobsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tenant = useMemo(() => (sp.get("tenant") ?? "").trim(), [sp]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!tenant) {
        setErr("加盟店が指定されていません。");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/portal/jobs?tenant=${encodeURIComponent(tenant)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace(`/my?tenant=${encodeURIComponent(tenant)}`);
          return;
        }
        if (!res.ok) throw new Error(j?.message ?? j?.error ?? "load failed");
        if (active) setJobs(Array.isArray(j.jobs) ? j.jobs : []);
      } catch (e: unknown) {
        if (active) setErr(e instanceof Error ? e.message : "作業状況の取得に失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [router, tenant]);

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      <div className="mb-6">
        <Link href="/my/shops" className="text-sm text-accent hover:underline">
          ← 店舗一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary">作業進捗確認</h1>
        <p className="mt-2 text-sm text-secondary">ご予約いただいた作業の進捗状況をご確認いただけます。</p>
      </div>

      {loading ? <div className="text-sm text-muted">読み込み中…</div> : null}
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400">
          {err}
        </div>
      ) : null}

      <div className="space-y-4">
        {jobs.map((job) => {
          const label = STATUS_LABEL[job.status] ?? job.status;
          const style = STATUS_STYLE[job.status] ?? STATUS_STYLE.confirmed;
          const veh = vehicleLabel(job.vehicle);
          return (
            <div key={job.id} className="rounded-3xl border border-border-default bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-primary">{job.title}</div>
                  {veh ? <div className="mt-1 text-sm text-muted">{veh}</div> : null}
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${style}`}>{label}</span>
              </div>
              <div className="mt-3 text-sm text-secondary">予約日 {formatDate(job.scheduled_date)}</div>
            </div>
          );
        })}
      </div>

      {!loading && !err && jobs.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface px-4 py-4 text-sm text-secondary">
          現在、進行中・予定の作業はありません。
        </div>
      ) : null}
    </main>
  );
}

export default function PortalJobsPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl p-6 text-sm text-muted">読み込み中…</main>}>
      <PortalJobsInner />
    </Suspense>
  );
}
