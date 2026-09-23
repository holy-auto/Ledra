/**
 * Field Test プロジェクトの集計（メーカー向け analytics API と PDF report で共有）。
 *
 * 以前は `manufacturer/field-test/analytics` と `.../report` がほぼ逐語コピーの ~90 行
 * 集計を各自持っており、片方だけ直すと数字が乖離した（/code-review #1123）。唯一の
 * 定義源をここに置く。DB 読み取りはサービスロール/呼び出し元スコープ済みクライアント経由。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type FtTenantDetail = {
  tenant_id: string;
  tenant_name: string;
  jobs: number;
  completed: number;
  pass: number;
  fail: number;
  conditional_pass: number;
  avg_score: number | null;
  defects: number;
  evidence: number;
};

export type FtProjectAggregate = {
  jobs: { total: number; by_status: Record<string, number> };
  inspections: {
    total: number;
    pass: number;
    fail: number;
    conditional_pass: number;
    pending: number;
    avg_score: number | null;
  };
  defects: { total: number; by_severity: Record<string, number>; by_status: Record<string, number> };
  evidence: { total: number; by_type: Record<string, number> };
  tenants: { total: number; completed_jobs: number };
  tenants_detail: FtTenantDetail[];
};

const round2 = (sum: number, n: number): number | null => (n > 0 ? Math.round((sum / n) * 100) / 100 : null);

/**
 * プロジェクト配下の jobs / inspections / defects / evidence を並列取得し、
 * グローバル集計と施工店別内訳を返す。DB エラーは throw（呼び出し元で 5xx にマップ）。
 */
export async function aggregateFtProject(
  admin: Supa,
  scope: { project_id: string; manufacturer_id: string },
): Promise<FtProjectAggregate> {
  const [jobsRes, inspRes, defectsRes, evidenceRes] = await Promise.all([
    admin.from("ft_jobs").select("id, status, tenant_id, completed_at").match(scope),
    admin.from("ft_inspections").select("result, score, job_id").match(scope),
    admin.from("ft_defects").select("severity, status, tenant_id").match(scope),
    admin.from("ft_evidence").select("evidence_type, tenant_id").match(scope),
  ]);
  if (jobsRes.error) throw jobsRes.error;
  if (inspRes.error) throw inspRes.error;
  if (defectsRes.error) throw defectsRes.error;
  if (evidenceRes.error) throw evidenceRes.error;

  const jobs = jobsRes.data ?? [];
  const inspections = inspRes.data ?? [];
  const defects = defectsRes.data ?? [];
  const evidence = evidenceRes.data ?? [];

  // ── Jobs ──
  const jobsByStatus: Record<string, number> = {};
  const tenantIds = new Set<string>();
  let completedJobs = 0;
  // job_id → tenant_id（inspections は job_id しか持たないため）
  const jobTenantMap = new Map<string, string>();
  for (const j of jobs) {
    jobsByStatus[j.status as string] = (jobsByStatus[j.status as string] ?? 0) + 1;
    if (j.tenant_id) tenantIds.add(j.tenant_id as string);
    if (j.completed_at) completedJobs++;
    if (j.id && j.tenant_id) jobTenantMap.set(j.id as string, j.tenant_id as string);
  }

  // ── Inspections ──
  let passCount = 0;
  let failCount = 0;
  let conditionalCount = 0;
  let pendingCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const i of inspections) {
    switch (i.result) {
      case "pass":
        passCount++;
        break;
      case "fail":
        failCount++;
        break;
      case "conditional_pass":
        conditionalCount++;
        break;
      case "pending":
        pendingCount++;
        break;
    }
    if (i.score != null) {
      scoreSum += Number(i.score);
      scoreCount++;
    }
  }

  // ── Defects / Evidence ──
  const bySeverity: Record<string, number> = {};
  const byDefectStatus: Record<string, number> = {};
  for (const d of defects) {
    bySeverity[d.severity as string] = (bySeverity[d.severity as string] ?? 0) + 1;
    byDefectStatus[d.status as string] = (byDefectStatus[d.status as string] ?? 0) + 1;
  }
  const byType: Record<string, number> = {};
  for (const e of evidence) {
    byType[e.evidence_type as string] = (byType[e.evidence_type as string] ?? 0) + 1;
  }

  // ── Per-tenant breakdown ──
  type TenantAgg = {
    jobs: number;
    completed: number;
    pass: number;
    fail: number;
    conditional_pass: number;
    scoreSum: number;
    scoreN: number;
    defects: number;
    evidence: number;
  };
  const tenantAgg = new Map<string, TenantAgg>();
  const ensure = (tid: string): TenantAgg => {
    let a = tenantAgg.get(tid);
    if (!a) {
      a = {
        jobs: 0,
        completed: 0,
        pass: 0,
        fail: 0,
        conditional_pass: 0,
        scoreSum: 0,
        scoreN: 0,
        defects: 0,
        evidence: 0,
      };
      tenantAgg.set(tid, a);
    }
    return a;
  };

  for (const j of jobs) {
    if (!j.tenant_id) continue;
    const a = ensure(j.tenant_id as string);
    a.jobs++;
    if (j.completed_at) a.completed++;
  }
  for (const i of inspections) {
    const tid = jobTenantMap.get(i.job_id as string);
    if (!tid) continue;
    const a = ensure(tid);
    if (i.result === "pass") a.pass++;
    else if (i.result === "fail") a.fail++;
    else if (i.result === "conditional_pass") a.conditional_pass++;
    if (i.score != null) {
      a.scoreSum += Number(i.score);
      a.scoreN++;
    }
  }
  for (const d of defects) {
    if (d.tenant_id) ensure(d.tenant_id as string).defects++;
  }
  for (const e of evidence) {
    if (e.tenant_id) ensure(e.tenant_id as string).evidence++;
  }

  // Resolve tenant names
  const allTenantIds = [...tenantAgg.keys()];
  const tenantNameMap = new Map<string, string>();
  if (allTenantIds.length > 0) {
    const { data: tRows } = await admin.from("tenants").select("id, name").in("id", allTenantIds);
    for (const t of tRows ?? []) tenantNameMap.set(t.id as string, (t.name as string) ?? "");
  }

  const tenants_detail: FtTenantDetail[] = [...tenantAgg.entries()]
    .sort(([, a], [, b]) => b.jobs - a.jobs)
    .map(([tid, a]) => ({
      tenant_id: tid,
      tenant_name: tenantNameMap.get(tid) ?? tid.slice(0, 8),
      jobs: a.jobs,
      completed: a.completed,
      pass: a.pass,
      fail: a.fail,
      conditional_pass: a.conditional_pass,
      avg_score: round2(a.scoreSum, a.scoreN),
      defects: a.defects,
      evidence: a.evidence,
    }));

  return {
    jobs: { total: jobs.length, by_status: jobsByStatus },
    inspections: {
      total: inspections.length,
      pass: passCount,
      fail: failCount,
      conditional_pass: conditionalCount,
      pending: pendingCount,
      avg_score: round2(scoreSum, scoreCount),
    },
    defects: { total: defects.length, by_severity: bySeverity, by_status: byDefectStatus },
    evidence: { total: evidence.length, by_type: byType },
    tenants: { total: tenantIds.size, completed_jobs: completedJobs },
    tenants_detail,
  };
}
