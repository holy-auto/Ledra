import { NextRequest } from "next/server";
import { z } from "zod";
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

const createJobSchema = z.object({
  project_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  title: z.string().trim().min(1, "タイトルは必須です。").max(200),
  description: z.string().trim().max(5000).optional(),
  job_code: z.string().trim().max(100).optional(),
});

/**
 * GET /api/manufacturer/field-test/jobs
 *
 * List field-test jobs for the caller's manufacturer.
 * Optional ?project_id and ?tenant_id filters. Joins tenant name.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const tenantId = url.searchParams.get("tenant_id");

  try {
    const admin = createServiceRoleAdmin("ft jobs list — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_jobs")
      .select("*, tenants(name)")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft jobs GET");

    type JobJoinRow = Record<string, unknown> & {
      tenants: { name: string | null } | { name: string | null }[] | null;
    };
    const jobs = (data ?? []).map((r: JobJoinRow) => {
      const tj = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
      return { ...r, tenant_name: tj?.name ?? null, tenants: undefined };
    });

    return apiJson({ jobs });
  } catch (e) {
    return apiInternalError(e, "ft jobs GET");
  }
}

/**
 * POST /api/manufacturer/field-test/jobs
 *
 * Create/assign a field-test job to a tenant. Admin only.
 * Snapshots the project's current conditions into conditions_snapshot.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("案件割当は admin ロールのみ実行できます。");

  const parsed = createJobSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft jobs create — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    // Verify the project belongs to this manufacturer
    const { data: project, error: projErr } = await admin
      .from("ft_projects")
      .select("id")
      .eq("id", parsed.data.project_id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (projErr) return apiInternalError(projErr, "ft jobs POST project lookup");
    if (!project) return apiNotFound("指定されたプロジェクトが見つかりません。");

    // Snapshot current conditions for the project
    const { data: conditions, error: condErr } = await admin
      .from("ft_conditions")
      .select("id, label, description, check_type, numeric_min, numeric_max, unit, is_required, sort_order")
      .eq("project_id", parsed.data.project_id)
      .eq("manufacturer_id", manufacturerId)
      .order("sort_order", { ascending: true });
    if (condErr) return apiInternalError(condErr, "ft jobs POST conditions snapshot");

    const { data, error } = await admin
      .from("ft_jobs")
      .insert({
        project_id: parsed.data.project_id,
        manufacturer_id: manufacturerId,
        tenant_id: parsed.data.tenant_id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        job_code: parsed.data.job_code ?? null,
        conditions_snapshot: conditions ?? [],
        assigned_by: caller.userId,
        status: "assigned",
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft jobs POST");

    return apiJson({ job: data });
  } catch (e) {
    return apiInternalError(e, "ft jobs POST");
  }
}
