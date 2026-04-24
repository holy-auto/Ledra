import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase.rpc("billing_analytics_stats", {
      p_tenant_id: caller.tenantId,
    });

    if (error) return apiInternalError(error, "billing-analytics RPC");

    return apiJson(data);
  } catch (e: unknown) {
    return apiInternalError(e, "billing-analytics GET");
  }
}
