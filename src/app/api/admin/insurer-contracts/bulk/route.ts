import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiValidationError, apiOk, apiInternalError } from "@/lib/api/response";
import { isPlatformTenantId } from "@/lib/auth/platformAdmin";
import { getAdminClient } from "@/lib/api/auth";

export const runtime = "nodejs";

/**
 * POST /api/admin/insurer-contracts/bulk
 * Create contracts between one insurer and multiple tenants. Platform admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();
    if (!isPlatformTenantId(caller.tenantId)) return apiForbidden();

    const body = await req.json();
    const { insurer_id, tenant_ids } = body;

    if (!insurer_id) return apiValidationError("insurer_id は必須です。");
    if (!Array.isArray(tenant_ids) || tenant_ids.length === 0) {
      return apiValidationError("tenant_ids は1件以上必要です。");
    }
    if (tenant_ids.length > 100) {
      return apiValidationError("一度に作成できる契約は100件までです。");
    }

    const admin = getAdminClient();
    const rows = tenant_ids.map((tid: string) => ({
      insurer_id,
      tenant_id: tid,
    }));

    const { data, error } = await admin
      .from("insurer_tenant_contracts")
      .upsert(rows, { onConflict: "insurer_id,tenant_id", ignoreDuplicates: false })
      .select("id, insurer_id, tenant_id, status, created_at, updated_at");

    if (error) return apiInternalError(error, "insurer-contracts bulk");
    return apiOk({ contracts: data ?? [], created: (data ?? []).length });
  } catch (e) {
    return apiInternalError(e, "insurer-contracts bulk");
  }
}
