import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { aggregateFtProject } from "@/lib/fieldTest/projectAggregate";

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

    const agg = await aggregateFtProject(admin, { project_id: projectId, manufacturer_id: manufacturerId });

    return apiJson({
      project: { id: project.id, name: project.name, status: project.status },
      jobs: agg.jobs,
      inspections: agg.inspections,
      defects: agg.defects,
      evidence: agg.evidence,
      tenants: agg.tenants,
      tenants_detail: agg.tenants_detail,
    });
  } catch (e) {
    return apiInternalError(e, "ft analytics GET");
  }
}
