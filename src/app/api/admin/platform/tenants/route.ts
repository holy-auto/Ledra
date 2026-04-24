import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/sanitize";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/tenants
 * Full tenant list for platform operations — platform admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!isPlatformAdmin(caller)) {
      return apiForbidden();
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const url = new URL(req.url);
    const search = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = 50;
    const offset = (page - 1) * limit;

    let query = admin
      .from("tenants")
      .select(
        "id, name, plan_tier, is_active, category, prefecture, created_at, stripe_subscription_id, stripe_customer_id",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("name", `%${escapeIlike(search)}%`);
    }
    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, count, error } = await query;
    if (error) {
      return apiInternalError(error, "GET /api/admin/platform/tenants query");
    }

    // Get member and certificate counts per tenant using batch queries (2 queries instead of 2*N)
    const tenantIds = (data ?? []).map((t) => t.id);
    const memberCounts: Record<string, number> = {};
    const certCounts: Record<string, number> = {};
    if (tenantIds.length > 0) {
      const [membersRes, certsRes] = await Promise.all([
        admin.from("tenant_memberships").select("tenant_id").in("tenant_id", tenantIds),
        admin.from("certificates").select("tenant_id").in("tenant_id", tenantIds),
      ]);
      for (const m of membersRes.data ?? []) {
        memberCounts[m.tenant_id] = (memberCounts[m.tenant_id] ?? 0) + 1;
      }
      for (const c of certsRes.data ?? []) {
        certCounts[c.tenant_id] = (certCounts[c.tenant_id] ?? 0) + 1;
      }
    }

    return apiJson({
      ok: true,
      tenants: (data ?? []).map((t) => ({
        ...t,
        memberCount: memberCounts[t.id] ?? 0,
        certCount: certCounts[t.id] ?? 0,
      })),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "GET /api/admin/platform/tenants");
  }
}
