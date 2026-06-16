import type { NextRequest } from "next/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { authorizeOrgStoreRead, parsePaging } from "@/lib/api/orgStoreRead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/organizations/[id]/stores/[tenantId]/vehicles
 *
 * 本社が指定店舗の車両を横断「閲覧」する (read-only)。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; tenantId: string }> }) {
  try {
    const { id: orgId, tenantId } = await params;
    const auth = await authorizeOrgStoreRead(orgId, tenantId);
    if (!auth.ok) return auth.response;

    const { limit, offset } = parsePaging(req);

    const { data, count, error } = await auth.admin
      .from("vehicles")
      .select(
        "id, maker, model, year, plate_display, customer_name, source_system, external_ref, last_synced_at, created_at",
        { count: "exact" },
      )
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return apiInternalError(error, "org store vehicles GET");

    return apiJson({ vehicles: data ?? [], total: count ?? 0, limit, offset });
  } catch (e) {
    return apiInternalError(e, "org store vehicles GET");
  }
}
