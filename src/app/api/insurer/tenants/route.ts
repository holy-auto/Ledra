import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/insurer/tenants
 * List contracted tenants with certificate count, case count, latest access date.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);
  const insurerId = caller.insurerId;

  type TenantAccessRow = {
    tenant_id: string;
    tenants: { id: string; name: string | null } | null;
  };
  type InsurerAccessLogRow = {
    meta: { tenant_id?: string } | null;
    created_at: string;
  };

  try {
    // Get active tenant access records with tenant info
    const { data: access, error: accessErr } = await admin
      .from("insurer_tenant_access")
      .select("tenant_id, tenants(id, name)")
      .eq("insurer_id", insurerId)
      .eq("is_active", true)
      .returns<TenantAccessRow[]>();

    if (accessErr) throw accessErr;

    const tenantRows = access ?? [];
    if (tenantRows.length === 0) {
      return apiJson({ tenants: [] });
    }

    const tenantIds = tenantRows.map((r) => r.tenant_id);

    // Count certificates per tenant
    const { data: certCounts, error: certErr } = await admin
      .from("certificates")
      .select("tenant_id")
      .in("tenant_id", tenantIds);

    if (certErr) throw certErr;

    const certMap: Record<string, number> = {};
    for (const c of certCounts ?? []) {
      certMap[c.tenant_id] = (certMap[c.tenant_id] ?? 0) + 1;
    }

    // Count cases per tenant
    const { data: caseCounts, error: caseErr } = await admin
      .from("insurer_cases")
      .select("tenant_id")
      .eq("insurer_id", insurerId)
      .in("tenant_id", tenantIds);

    if (caseErr) throw caseErr;

    const caseMap: Record<string, number> = {};
    for (const c of caseCounts ?? []) {
      if (c.tenant_id) caseMap[c.tenant_id] = (caseMap[c.tenant_id] ?? 0) + 1;
    }

    // Latest access log per tenant
    const { data: accessLogs, error: logErr } = await admin
      .from("insurer_access_logs")
      .select("meta, created_at")
      .eq("insurer_id", insurerId)
      .order("created_at", { ascending: false })
      .returns<InsurerAccessLogRow[]>();

    if (logErr) throw logErr;

    // Build a map of tenant_id -> latest access date from logs that reference tenants
    const lastAccessMap: Record<string, string> = {};
    for (const log of accessLogs ?? []) {
      const tid = log.meta?.tenant_id;
      if (tid && tenantIds.includes(tid) && !lastAccessMap[tid]) {
        lastAccessMap[tid] = log.created_at;
      }
    }

    const tenants = tenantRows.map((r) => {
      const tenant = r.tenants;
      const tid = r.tenant_id;
      return {
        tenant_id: tid,
        name: tenant?.name ?? "-",
        certificate_count: certMap[tid] ?? 0,
        case_count: caseMap[tid] ?? 0,
        last_access: lastAccessMap[tid] ?? null,
      };
    });

    return apiJson({ tenants });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/tenants");
  }
}
