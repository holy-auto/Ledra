import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiOk,
  apiInternalError,
} from "@/lib/api/response";
import { isPlatformTenantId } from "@/lib/auth/platformAdmin";
import { insurerContractCreateSchema, insurerContractUpdateSchema } from "@/lib/validations/insurer-contract";

export const runtime = "nodejs";

/**
 * GET /api/admin/insurer-contracts
 * List insurer-tenant contracts. Platform admins see all, regular admins see their tenant's contracts.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const insurerId = req.nextUrl.searchParams.get("insurer_id");
    const tenantId = req.nextUrl.searchParams.get("tenant_id");

    let query = admin
      .from("insurer_tenant_contracts")
      .select(
        "id, insurer_id, tenant_id, status, terminated_at, created_at, updated_at, insurers(name, slug), tenants(name, slug)",
      )
      .order("created_at", { ascending: false });

    // Platform admin can filter by insurer or tenant
    if (isPlatformTenantId(caller.tenantId)) {
      if (insurerId) query = query.eq("insurer_id", insurerId);
      if (tenantId) query = query.eq("tenant_id", tenantId);
    } else {
      // Regular admin: only see their own tenant's contracts
      query = query.eq("tenant_id", caller.tenantId);
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "insurer-contracts list");

    return apiOk({ contracts: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "insurer-contracts list");
  }
}

/**
 * POST /api/admin/insurer-contracts
 * Create a new insurer-tenant contract. Platform admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();
    if (!isPlatformTenantId(caller.tenantId)) return apiForbidden();

    const parsed = insurerContractCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { insurer_id, tenant_id } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Check for existing contract
    const { data: existing } = await admin
      .from("insurer_tenant_contracts")
      .select("id, status")
      .eq("insurer_id", insurer_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return apiValidationError("この保険会社とテナントの契約は既に存在します。");
      }
      // Reactivate terminated/suspended contract
      const { data, error } = await admin
        .from("insurer_tenant_contracts")
        .update({ status: "active", terminated_at: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, insurer_id, tenant_id, status, terminated_at, created_at, updated_at")
        .single();
      if (error) return apiInternalError(error, "insurer-contracts reactivate");
      return apiOk({ contract: data });
    }

    const { data, error } = await admin
      .from("insurer_tenant_contracts")
      .insert({ insurer_id, tenant_id })
      .select("id, insurer_id, tenant_id, status, terminated_at, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "insurer-contracts create");
    return apiJson({ contract: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "insurer-contracts create");
  }
}

/**
 * PUT /api/admin/insurer-contracts
 * Update contract status (suspend/terminate/reactivate). Platform admin only.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();
    if (!isPlatformTenantId(caller.tenantId)) return apiForbidden();

    const parsed = insurerContractUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, status } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "terminated") {
      patch.terminated_at = new Date().toISOString();
    } else {
      patch.terminated_at = null;
    }

    const { data, error } = await admin
      .from("insurer_tenant_contracts")
      .update(patch)
      .eq("id", id)
      .select("id, insurer_id, tenant_id, status, terminated_at, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "insurer-contracts update");
    return apiOk({ contract: data });
  } catch (e) {
    return apiInternalError(e, "insurer-contracts update");
  }
}
