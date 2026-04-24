import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const ACTIVE_TENANT_COOKIE = "active_tenant_id";

/**
 * GET /api/admin/tenants
 * Returns all tenants the current user belongs to, plus which is active.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data: memberships, error } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, role, tenants(id, name, slug, plan_tier, is_active, logo_asset_path)")
      .eq("user_id", caller.userId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) return apiInternalError(error, "list tenant memberships");

    const cookieStore = await cookies();
    const activeTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;

    const tenants = (memberships ?? []).map((m: any) => ({
      tenant_id: m.tenant_id,
      role: m.role,
      ...(m.tenants ?? {}),
      is_current: m.tenant_id === activeTenantId,
    }));

    // If no cookie is set and user has tenants, mark the first one as current
    if (tenants.length > 0 && !tenants.some((t: any) => t.is_current)) {
      tenants[0].is_current = true;
    }

    return apiJson({ tenants, count: tenants.length });
  } catch (e) {
    return apiInternalError(e, "list tenants");
  }
}

/**
 * PUT /api/admin/tenants
 * Switch active tenant. Body: { tenant_id: string }
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const tenantId = body?.tenant_id;

    if (!tenantId || typeof tenantId !== "string") {
      return apiValidationError("tenant_id is required");
    }

    // Verify the user is a member of the target tenant
    const { data: mem, error } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", caller.userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) return apiInternalError(error, "verify tenant membership");
    if (!mem) return apiValidationError("このテナントに所属していません。");

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return apiJson({
      ok: true,
      tenant_id: tenantId,
      role: mem.role,
    });
  } catch (e) {
    return apiInternalError(e, "switch tenant");
  }
}
