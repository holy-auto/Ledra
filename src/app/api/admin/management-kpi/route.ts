import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase.rpc("management_kpi_stats", {
      p_tenant_id: caller.tenantId,
    });

    if (error) return apiInternalError(error, "management-kpi RPC");

    // Explicit short cache — dashboard refresh smoothing.
    return apiJson(data, { cacheControl: "private, max-age=10, stale-while-revalidate=30" });
  } catch (e: unknown) {
    return apiInternalError(e, "management-kpi GET");
  }
}
