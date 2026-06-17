import type { NextRequest } from "next/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { authorizeOrgStoreRead, parsePaging } from "@/lib/api/orgStoreRead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/organizations/[id]/stores/[tenantId]/customers
 *
 * 本社が指定店舗の顧客を横断「閲覧」する (read-only)。
 * owner / 本社メンバーのみ。対象店舗が組織所属であることを検証する。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; tenantId: string }> }) {
  try {
    const { id: orgId, tenantId } = await params;
    const auth = await authorizeOrgStoreRead(orgId, tenantId);
    if (!auth.ok) return auth.response;

    const { limit, offset } = parsePaging(req);

    const { data, count, error } = await auth.admin
      .from("customers")
      .select("id, name, name_kana, email, phone, address, source_system, external_ref, last_synced_at, created_at", {
        count: "exact",
      })
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return apiInternalError(error, "org store customers GET");

    return apiJson({ customers: data ?? [], total: count ?? 0, limit, offset });
  } catch (e) {
    return apiInternalError(e, "org store customers GET");
  }
}
