import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/analytics?project_id=xxx
 *
 * Aggregate analytics for a field-test project.
 * Returns counts for jobs, inspections, defects, evidence, and tenants.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return apiValidationError("project_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft analytics — caller-scoped aggregate read");
    const manufacturerId = caller.manufacturerId;

    // Fetch project
    const { data: project, error: projErr } = await admin
      .from("ft_projects")
      .select("id, name, status")
      .eq("id", projectId)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (projErr) return apiInternalError(projErr, "ft analytics project lookup");
    if (!project) return apiNotFound("プロジェクトが見つかりません。");

    // Parallel fetch all related data
    const scope = { project_id: projectId, manufacturer_id: manufacturerId };
    const [jobsRes, inspRes, defectsRes, evidenceRes] = await Promise.all([
      admin.from("ft_jobs").select("status, tenant_id, completed_at").match(scope),
      admin.from("ft_inspections").select("result, score").match(scope),
      admin.from("ft_defects").select("severity, status").match(scope),
      admin.from("ft_evidence").select("evidence_type").match(scope),
    ]);

    if (jobsRes.error) return apiInternalError(jobsRes.error, "ft analytics jobs");
    if (inspRes.error) return apiInternalError(inspRes.error, "ft analytics inspections");
    if (defectsRes.error) return apiInternalError(defectsRes.error, "ft analytics defects");
    if (evidenceRes.error) return apiInternalError(evidenceRes.error, "ft analytics evidence");

    const jobs = jobsRes.data ?? [];
    const inspections = inspRes.data ?? [];
    const defects = defectsRes.data ?? [];
    const evidence = evidenceRes.data ?? [];

    // Jobs aggregation
    const jobsByStatus: Record<string, number> = {};
    const tenantIds = new Set<string>();
    let completedJobs = 0;
    for (const j of jobs) {
      jobsByStatus[j.status as string] = (jobsByStatus[j.status as string] ?? 0) + 1;
      if (j.tenant_id) tenantIds.add(j.tenant_id as string);
      if (j.completed_at) completedJobs++;
    }

    // Inspections aggregation
    let passCount = 0;
    let failCount = 0;
    let conditionalCount = 0;
    let pendingCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const i of inspections) {
      switch (i.result) {
        case "pass": passCount++; break;
        case "fail": failCount++; break;
        case "conditional_pass": conditionalCount++; break;
        case "pending": pendingCount++; break;
      }
      if (i.score != null) { scoreSum += Number(i.score); scoreCount++; }
    }

    // Defects aggregation
    const bySeverity: Record<string, number> = {};
    const byDefectStatus: Record<string, number> = {};
    for (const d of defects) {
      bySeverity[d.severity as string] = (bySeverity[d.severity as string] ?? 0) + 1;
      byDefectStatus[d.status as string] = (byDefectStatus[d.status as string] ?? 0) + 1;
    }

    // Evidence aggregation
    const byType: Record<string, number> = {};
    for (const e of evidence) {
      byType[e.evidence_type as string] = (byType[e.evidence_type as string] ?? 0) + 1;
    }

    return apiJson({
      project: { id: project.id, name: project.name, status: project.status },
      jobs: { total: jobs.length, by_status: jobsByStatus },
      inspections: {
        total: inspections.length,
        pass: passCount,
        fail: failCount,
        conditional_pass: conditionalCount,
        pending: pendingCount,
        avg_score: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null,
      },
      defects: { total: defects.length, by_severity: bySeverity, by_status: byDefectStatus },
      evidence: { total: evidence.length, by_type: byType },
      tenants: { total: tenantIds.size, completed_jobs: completedJobs },
    });
  } catch (e) {
    return apiInternalError(e, "ft analytics GET");
  }
}
