import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/applications
 *
 * List applications filtered by ?project_id or ?recruitment_id.
 * Joins tenant name for display.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const recruitmentId = url.searchParams.get("recruitment_id");

  if (!projectId && !recruitmentId) {
    return apiValidationError("project_id または recruitment_id のいずれかは必須です。");
  }

  try {
    const admin = createServiceRoleAdmin("ft applications list — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_applications")
      .select("*, tenants(name)")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (recruitmentId) query = query.eq("recruitment_id", recruitmentId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft applications GET");

    return apiJson({ applications: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft applications GET");
  }
}
