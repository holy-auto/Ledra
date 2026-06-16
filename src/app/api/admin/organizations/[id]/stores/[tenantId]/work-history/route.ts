import type { NextRequest } from "next/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { authorizeOrgStoreRead, parsePaging } from "@/lib/api/orgStoreRead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/organizations/[id]/stores/[tenantId]/work-history
 *
 * 本社が指定店舗の作業履歴 (vehicle_histories) を横断「閲覧」する (read-only)。
 * ?vehicle_id=uuid で特定車両に絞り込み可能。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; tenantId: string }> }) {
  try {
    const { id: orgId, tenantId } = await params;
    const auth = await authorizeOrgStoreRead(orgId, tenantId);
    if (!auth.ok) return auth.response;

    const { limit, offset } = parsePaging(req);
    const vehicleId = new URL(req.url).searchParams.get("vehicle_id");

    let query = auth.admin
      .from("vehicle_histories")
      .select(
        "id, vehicle_id, certificate_id, type, title, description, performed_at, source_system, external_ref, created_at",
        { count: "exact" },
      )
      .eq("tenant_id", auth.tenantId);

    if (vehicleId) query = query.eq("vehicle_id", vehicleId);

    const { data, count, error } = await query
      .order("performed_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return apiInternalError(error, "org store work-history GET");

    return apiJson({ work_history: data ?? [], total: count ?? 0, limit, offset });
  } catch (e) {
    return apiInternalError(e, "org store work-history GET");
  }
}
