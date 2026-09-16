"use client";

import { useEffect, useState } from "react";

type Analytics = {
  project: { id: string; name: string; status: string };
  jobs: { total: number; by_status: Record<string, number> };
  inspections: { total: number; pass: number; fail: number; conditional_pass: number; pending: number; avg_score: number | null };
  defects: { total: number; by_severity: Record<string, number>; by_status: Record<string, number> };
  evidence: { total: number; by_type: Record<string, number> };
  tenants: { total: number; completed_jobs: number };
};

const JOB_STATUS_JA: Record<string, string> = {
  assigned: "割当済",
  in_progress: "施工中",
  evidence_submitted: "証拠提出済",
  inspection: "検査中",
  completed: "完了",
  rejected: "差戻し",
};

const SEV_JA: Record<string, string> = { low: "軽微", medium: "中", high: "重大", critical: "致命的" };
const DEF_STATUS_JA: Record<string, string> = { open: "未対応", investigating: "調査中", resolved: "解決済", closed: "クローズ", wontfix: "対応不要" };
const EVT_JA: Record<string, string> = { photo_before: "施工前", photo_during: "施工中", photo_after: "施工後", measurement: "計測", env_data: "環境", video: "動画", document: "書類", other: "その他" };

export default function AnalyticsTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/manufacturer/field-test/analytics?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setData(json.error ? null : json))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;
  if (!data) return <div className="text-sm text-secondary">分析データを取得できませんでした。</div>;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card label="総案件数" value={data.jobs.total} />
        <Card label="参加テナント" value={data.tenants.total} />
        <Card label="完了案件" value={data.tenants.completed_jobs} />
        <Card label="品質検査" value={data.inspections.total} />
        <Card label="不具合報告" value={data.defects.total} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Jobs by status */}
        <Section title="案件ステータス別">
          <BarList data={data.jobs.by_status} labels={JOB_STATUS_JA} total={data.jobs.total} />
        </Section>

        {/* Inspections */}
        <Section title="品質検査結果">
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">合格: {data.inspections.pass}</span>
              <span className="text-yellow-600 font-medium">条件付: {data.inspections.conditional_pass}</span>
              <span className="text-red-600 font-medium">不合格: {data.inspections.fail}</span>
              <span className="text-gray-500">未検査: {data.inspections.pending}</span>
            </div>
            {data.inspections.avg_score != null && (
              <div className="text-sm text-primary">平均スコア: <span className="font-bold">{data.inspections.avg_score.toFixed(1)}</span>点</div>
            )}
          </div>
        </Section>

        {/* Defects by severity */}
        <Section title="不具合 (重大度別)">
          <BarList data={data.defects.by_severity} labels={SEV_JA} total={data.defects.total} />
        </Section>

        {/* Defects by status */}
        <Section title="不具合 (ステータス別)">
          <BarList data={data.defects.by_status} labels={DEF_STATUS_JA} total={data.defects.total} />
        </Section>

        {/* Evidence by type */}
        <Section title="証拠データ (種別)">
          <BarList data={data.evidence.by_type} labels={EVT_JA} total={data.evidence.total} />
        </Section>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-primary">{value.toLocaleString("ja-JP")}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="text-xs font-semibold text-muted mb-3">{title}</div>
      {children}
    </div>
  );
}

function BarList({ data, labels, total }: { data: Record<string, number>; labels: Record<string, string>; total: number }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return <div className="text-xs text-muted">データなし</div>;
  return (
    <div className="space-y-1.5">
      {entries.map(([key, count]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-20 text-xs text-secondary truncate">{labels[key] ?? key}</span>
          <div className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent/60"
              style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
            />
          </div>
          <span className="w-8 text-right text-xs font-medium text-primary">{count}</span>
        </div>
      ))}
    </div>
  );
}
