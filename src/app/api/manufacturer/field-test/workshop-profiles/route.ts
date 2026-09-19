import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/workshop-profiles
 *
 * List workshop capability profiles.
 * - ?project_id=X → profiles of workshops participating in the project (approved applicants + assigned jobs)
 * - ?tenant_id=X  → single tenant's profile
 * - no filter     → all profiles (for browsing)
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const tenantId = url.searchParams.get("tenant_id");

  try {
    const admin = createServiceRoleAdmin("workshop profiles list — manufacturer-scoped");

    if (tenantId) {
      const { data, error } = await admin.from("workshop_capability_profiles").select("*").eq("tenant_id", tenantId);
      if (error) return apiInternalError(error, "workshop profiles GET");
      return apiJson({ profiles: data ?? [] });
    }

    if (projectId) {
      // Collect tenant IDs from approved applications + assigned jobs
      const [appResult, jobResult] = await Promise.all([
        admin
          .from("ft_applications")
          .select("tenant_id")
          .eq("project_id", projectId)
          .eq("manufacturer_id", caller.manufacturerId)
          .eq("status", "approved"),
        admin
          .from("ft_jobs")
          .select("tenant_id")
          .eq("project_id", projectId)
          .eq("manufacturer_id", caller.manufacturerId),
      ]);

      const tenantIds = [
        ...new Set([
          ...(appResult.data?.map((r) => r.tenant_id) ?? []),
          ...(jobResult.data?.map((r) => r.tenant_id) ?? []),
        ]),
      ];

      if (tenantIds.length === 0) return apiJson({ profiles: [] });

      const { data, error } = await admin.from("workshop_capability_profiles").select("*").in("tenant_id", tenantIds);
      if (error) return apiInternalError(error, "workshop profiles GET");
      return apiJson({ profiles: data ?? [] });
    }

    // No filter — return all profiles
    const { data, error } = await admin
      .from("workshop_capability_profiles")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return apiInternalError(error, "workshop profiles GET");
    return apiJson({ profiles: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "workshop profiles GET");
  }
}
