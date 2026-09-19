import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/export?project_id=xxx
 *
 * Export all field-test data for a project as JSON. Admin only.
 * Returns the project, jobs, evidence, inspections, defects, and
 * condition checks — the "検証可能なField Data" endpoint.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("エクスポートは admin ロールのみ実行できます。");

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return apiValidationError("project_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft export — admin caller full project dump");
    const manufacturerId = caller.manufacturerId;

    // Fetch project
    const { data: project, error: projErr } = await admin
      .from("ft_projects")
      .select("*")
      .eq("id", projectId)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (projErr) return apiInternalError(projErr, "ft export project lookup");
    if (!project) return apiNotFound("プロジェクトが見つかりません。");

    const scope = { project_id: projectId, manufacturer_id: manufacturerId };

    // Parallel fetch all related data
    const [jobsRes, evidenceRes, inspectionsRes, defectsRes] = await Promise.all([
      admin.from("ft_jobs").select("*").match(scope).order("created_at", { ascending: true }),
      admin.from("ft_evidence").select("*").match(scope).order("created_at", { ascending: true }),
      admin.from("ft_inspections").select("*").match(scope).order("created_at", { ascending: true }),
      admin.from("ft_defects").select("*").match(scope).order("created_at", { ascending: true }),
    ]);

    if (jobsRes.error) return apiInternalError(jobsRes.error, "ft export jobs");
    if (evidenceRes.error) return apiInternalError(evidenceRes.error, "ft export evidence");
    if (inspectionsRes.error) return apiInternalError(inspectionsRes.error, "ft export inspections");
    if (defectsRes.error) return apiInternalError(defectsRes.error, "ft export defects");

    // Condition checks: scoped via job_ids (no manufacturer_id column on ft_condition_checks)
    const jobIds = (jobsRes.data ?? []).map((j) => (j as { id: string }).id);
    let conditionChecks: unknown[] = [];
    if (jobIds.length > 0) {
      const { data: checks, error: checksErr } = await admin
        .from("ft_condition_checks")
        .select("*")
        .in("job_id", jobIds)
        .order("checked_at", { ascending: true });
      if (checksErr) return apiInternalError(checksErr, "ft export condition_checks");
      conditionChecks = checks ?? [];
    }

    return apiJson({
      project,
      jobs: jobsRes.data ?? [],
      evidence: evidenceRes.data ?? [],
      inspections: inspectionsRes.data ?? [],
      defects: defectsRes.data ?? [],
      condition_checks: conditionChecks,
    });
  } catch (e) {
    return apiInternalError(e, "ft export GET");
  }
}
