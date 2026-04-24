import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/sanitize";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * GET /api/admin/insurers/tenant-access/tenants?q=search
 * Search tenants for the grant form autocomplete.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
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
}
