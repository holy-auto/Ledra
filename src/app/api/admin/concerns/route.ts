import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

/**
 * GET /api/admin/concerns — テナントの顧客懸念一覧
 *
 * ?status=open|investigating|resolved|dismissed|all (default: all)
 * ?job_id=xxx — ジョブで絞り込み
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    const jobId = url.searchParams.get("job_id");
    const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "50", 10) || 50));

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("customer_concerns")
      .select(
        "id, source_type, customer_name, customer_email, concern_text, category, status, admin_response, resolved_at, created_at, updated_at, job_id, certificate_id",
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(perPage);

    if (status !== "all") query = query.eq("status", status);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "admin/concerns GET");

    return apiJson({ ok: true, concerns: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "admin/concerns GET");
  }
}
