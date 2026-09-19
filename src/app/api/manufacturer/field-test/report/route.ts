import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { renderFieldTestReport, type FtReportData, type FtReportTenantDetail } from "@/lib/pdf/pdfFieldTestReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/report?project_id=xxx
 *
 * Generate a PDF summary report for a field-test project. Admin only.
 * Returns application/pdf as attachment.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin")
    return apiForbidden("レポート生成は admin ロールのみ実行できます。");

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return apiValidationError("project_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft report — admin caller PDF generation");
    const mfId = caller.manufacturerId;

    // Fetch project
    const { data: project, error: projErr } = await admin
      .from("ft_projects")
      .select("id, name, status, product_name, budget, target_units, starts_at, ends_at")
      .eq("id", projectId)
      .eq("manufacturer_id", mfId)
      .maybeSingle();
    if (projErr) return apiInternalError(projErr, "ft report project lookup");
    if (!project) return apiNotFound("プロジェクトが見つかりません。");

    const scope = { project_id: projectId, manufacturer_id: mfId };

    // Parallel fetch
    const [jobsRes, inspRes, defectsRes, evidenceRes] = await Promise.all([
      admin
        .from("ft_jobs")
        .select("status, tenant_id, completed_at")
        .match(scope),
      admin
        .from("ft_inspections")
        .select("result, score, job_id")
        .match(scope),
      admin
        .from("ft_defects")
        .select("severity, status, tenant_id")
        .match(scope),
      admin
        .from("ft_evidence")
        .select("evidence_type, tenant_id")
        .match(scope),
    ]);

    if (jobsRes.error) return apiInternalError(jobsRes.error, "ft report jobs");
    if (inspRes.error) return apiInternalError(inspRes.error, "ft report inspections");
    if (defectsRes.error) return apiInternalError(defectsRes.error, "ft report defects");
    if (evidenceRes.error) return apiInternalError(evidenceRes.error, "ft report evidence");

    const jobs = jobsRes.data ?? [];
    const inspections = inspRes.data ?? [];
    const defects = defectsRes.data ?? [];
    const evidence = evidenceRes.data ?? [];

    // Build job_id → tenant_id map for inspections
    const { data: jobTenantRows } = await admin
      .from("ft_jobs")
      .select("id, tenant_id")
      .match(scope);
    const jobTenantMap = new Map(
      (jobTenantRows ?? []).map((j) => [j.id as string, j.tenant_id as string]),
    );

    // ── Aggregate: global ──
    const jobsByStatus: Record<string, number> = {};
    const tenantIds = new Set<string>();
    for (const j of jobs) {
      jobsByStatus[j.status as string] = (jobsByStatus[j.status as string] ?? 0) + 1;
      if (j.tenant_id) tenantIds.add(j.tenant_id as string);
    }

    let passCount = 0, failCount = 0, condCount = 0, pendCount = 0;
    let scoreSum = 0, scoreN = 0;
    for (const i of inspections) {
      switch (i.result) {
        case "pass": passCount++; break;
        case "fail": failCount++; break;
        case "conditional_pass": condCount++; break;
        case "pending": pendCount++; break;
      }
      if (i.score != null) { scoreSum += Number(i.score); scoreN++; }
    }

    const bySev: Record<string, number> = {};
    const byDefSt: Record<string, number> = {};
    for (const d of defects) {
      bySev[d.severity as string] = (bySev[d.severity as string] ?? 0) + 1;
      byDefSt[d.status as string] = (byDefSt[d.status as string] ?? 0) + 1;
    }

    const byType: Record<string, number> = {};
    for (const e of evidence) {
      byType[e.evidence_type as string] = (byType[e.evidence_type as string] ?? 0) + 1;
    }

    // ── Aggregate: per tenant ──
    const tenantAgg = new Map<string, {
      jobs: number; completed: number;
      pass: number; fail: number; conditional_pass: number;
      scoreSum: number; scoreN: number;
      defects: number; evidence: number;
    }>();

    const ensureTenant = (tid: string) => {
      if (!tenantAgg.has(tid)) {
        tenantAgg.set(tid, {
          jobs: 0, completed: 0,
          pass: 0, fail: 0, conditional_pass: 0,
          scoreSum: 0, scoreN: 0,
          defects: 0, evidence: 0,
        });
      }
      return tenantAgg.get(tid)!;
    };

    for (const j of jobs) {
      const a = ensureTenant(j.tenant_id as string);
      a.jobs++;
      if (j.completed_at) a.completed++;
    }

    for (const i of inspections) {
      const tid = jobTenantMap.get(i.job_id as string);
      if (!tid) continue;
      const a = ensureTenant(tid);
      if (i.result === "pass") a.pass++;
      else if (i.result === "fail") a.fail++;
      else if (i.result === "conditional_pass") a.conditional_pass++;
      if (i.score != null) { a.scoreSum += Number(i.score); a.scoreN++; }
    }

    for (const d of defects) {
      if (!d.tenant_id) continue;
      ensureTenant(d.tenant_id as string).defects++;
    }

    for (const e of evidence) {
      ensureTenant(e.tenant_id as string).evidence++;
    }

    // Resolve tenant names
    const allTenantIds = [...tenantAgg.keys()];
    const tenantNameMap = new Map<string, string>();
    if (allTenantIds.length > 0) {
      const { data: tRows } = await admin
        .from("tenants")
        .select("id, name")
        .in("id", allTenantIds);
      for (const t of tRows ?? []) {
        tenantNameMap.set(t.id as string, (t.name as string) ?? "");
      }
    }

    const tenants_detail: FtReportTenantDetail[] = [...tenantAgg.entries()]
      .sort(([, a], [, b]) => b.jobs - a.jobs)
      .map(([tid, a]) => ({
        tenant_id: tid,
        tenant_name: tenantNameMap.get(tid) ?? tid.slice(0, 8),
        jobs: a.jobs,
        completed: a.completed,
        pass: a.pass,
        fail: a.fail,
        conditional_pass: a.conditional_pass,
        avg_score: a.scoreN > 0 ? Math.round((a.scoreSum / a.scoreN) * 100) / 100 : null,
        defects: a.defects,
        evidence: a.evidence,
      }));

    // ── Build report data ──
    const reportData: FtReportData = {
      project: {
        id: project.id as string,
        name: project.name as string,
        status: project.status as string,
        product_name: project.product_name as string | null,
        budget: project.budget as number | null,
        target_units: project.target_units as number | null,
        starts_at: project.starts_at as string | null,
        ends_at: project.ends_at as string | null,
      },
      generated_at: new Date().toISOString(),
      jobs: { total: jobs.length, by_status: jobsByStatus },
      inspections: {
        total: inspections.length,
        pass: passCount,
        fail: failCount,
        conditional_pass: condCount,
        pending: pendCount,
        avg_score: scoreN > 0 ? Math.round((scoreSum / scoreN) * 100) / 100 : null,
      },
      defects: { total: defects.length, by_severity: bySev, by_status: byDefSt },
      evidence: { total: evidence.length, by_type: byType },
      tenants_detail,
    };

    // ── Render PDF ──
    const pdfBuffer = await renderFieldTestReport(reportData);

    const safeName = (project.name as string).replace(/[^\w\u3000-\u9FFF-]/g, "_");
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="ft_report_${safeName}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return apiInternalError(e, "ft report GET");
  }
}
