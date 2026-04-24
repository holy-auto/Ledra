import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

/**
 * GET /api/admin/agent-applications
 * List agent applications with optional status filter.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const status = request.nextUrl.searchParams.get("status");

    let query = admin
      .from("agent_applications")
      .select(
        "id, application_number, company_name, contact_name, email, phone, industry, status, created_at, updated_at, rejection_reason",
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return apiInternalError(error, "agent-applications GET");
    }

    return apiJson({ applications: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-applications GET");
  }
}
