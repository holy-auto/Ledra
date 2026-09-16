import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/sanitize";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";

/**
 * GET /api/admin/insurers/tenant-access/tenants?q=search
 * Search tenants for the grant form autocomplete.
 */
export const GET = withCaller(
  async (req, { caller }) => {
    try {
      if (!caller || !isPlatformAdmin(caller)) {
        return apiForbidden();
      }

      const url = new URL(req.url);
      const q = url.searchParams.get("q")?.trim() ?? "";

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      let query = admin
        .from("tenants")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(50);

      if (q) {
        query = query.ilike("name", `%${escapeIlike(q)}%`);
      }

      const { data, error } = await query;
      if (error) {
        return apiInternalError(error, "tenant-access/tenants GET");
      }

      return apiJson({ tenants: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "admin/insurers/tenant-access/tenants");
    }
  },
  { routeName: "admin/insurers/tenant-access/tenants" },
);
