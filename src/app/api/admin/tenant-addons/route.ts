import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { ADDON_CATALOG, listEnabledAddons } from "@/lib/billing/addons";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tenant-addons
 *
 * Returns the addon catalog merged with the caller's tenant's enabled
 * state. Any authenticated tenant member can read — addon visibility is
 * not sensitive (the gating itself happens on a separate path).
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const enabled = await listEnabledAddons(admin, caller.tenantId);

    const addons = ADDON_CATALOG.map((entry) => ({
      key: entry.key,
      label: entry.label,
      description: entry.description,
      primaryRoute: entry.primaryRoute,
      enabled: enabled.has(entry.key),
    }));

    return apiJson({ ok: true, addons });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/tenant-addons GET");
  }
}
