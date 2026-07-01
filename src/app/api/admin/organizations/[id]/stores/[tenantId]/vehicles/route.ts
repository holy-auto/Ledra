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

    // 顧客名は vehicles.customer_name (廃止済み) ではなく customers リレーション経由で解決する。
    const { data, count, error } = await auth.admin
      .from("vehicles")
      .select(
        "id, maker, model, year, plate_display, customer_id, customer:customers(name), source_system, external_ref, last_synced_at, created_at",
        { count: "exact" },
      )
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return apiInternalError(error, "org store vehicles GET");

    // 既存レスポンス形状を維持するため customer_name を平坦化して返す。
    // PostgREST の埋め込みは配列/オブジェクトどちらにも型付けされ得るので両対応。
    const vehicles = (data ?? []).map((row) => {
      const { customer, ...rest } = row as Record<string, unknown> & { customer?: unknown };
      const cust = Array.isArray(customer) ? customer[0] : customer;
      const name = (cust as { name?: string | null } | null | undefined)?.name ?? null;
      return { ...rest, customer_name: name };
    });

    return apiJson({ vehicles, total: count ?? 0, limit, offset });
  } catch (e) {
    return apiInternalError(e, "org store vehicles GET");
  }
}
