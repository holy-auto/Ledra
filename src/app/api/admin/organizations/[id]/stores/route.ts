import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { resolveOrgAccess } from "@/lib/auth/orgAccess";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/organizations/[id]/stores
 *
 * 本社が横断閲覧できる所属店舗 (tenants) の一覧。
 * owner / 本社メンバー (org_admin / org_viewer) が閲覧可。
 * 既存の members ルートは owner 限定のため、本社メンバーでも使えるよう別に提供する。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: orgId } = await params;
    const access = await resolveOrgAccess(supabase, orgId, caller.userId);
    if (!access) return apiNotFound("対象の組織が見つかりません。");

    const admin = createPlatformScopedAdmin("本社による所属店舗一覧の参照 (read-only クロステナント)");

    const { data: members, error } = await admin
      .from("organization_members")
      .select("tenant_id, role, joined_at, tenant:tenants ( id, name, plan_tier )")
      .eq("organization_id", orgId)
      .order("joined_at", { ascending: true });
    if (error) return apiInternalError(error, "org stores GET");

    const stores = (members ?? []).map((m) => {
      const tenant = (m as { tenant?: { name?: string; plan_tier?: string } | null }).tenant ?? null;
      return {
        tenant_id: m.tenant_id,
        tenant_name: tenant?.name ?? null,
        plan_tier: tenant?.plan_tier ?? null,
        role: m.role,
        joined_at: m.joined_at,
      };
    });

    return apiJson({ stores, access_level: access.level });
  } catch (e) {
    return apiInternalError(e, "org stores GET");
  }
}
