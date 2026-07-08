import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/[id]/certificates
 *
 * Returns all certificates for a specific customer, ordered by created_at desc.
 * Includes vehicle info and image count per certificate.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: customerId } = await params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // Fetch certificates for this customer within the caller's tenant。
    // 画像枚数は埋め込み集約 (certificate_images(count)) で DB 側で数える。
    // 以前は全画像行を取得して JS でカウントしていた (N+1 的な過剰取得) のを解消。
    const { data: certificates, error } = await supabase
      .from("certificates")
      .select(
        "id, public_id, status, vehicle_maker, vehicle_model, vehicle_plate, created_at, service_type, certificate_images(count)",
      )
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[customer-certificates] db_error:", error.message);
      return apiInternalError(error, "customer-certificates");
    }

    const rows = (certificates ?? []) as Array<Record<string, unknown>>;

    const result = rows.map((c) => {
      // 埋め込み集約は certificate_images: [{ count: N }] の形で返る。
      const agg = c.certificate_images as Array<{ count: number }> | null | undefined;
      const image_count = Array.isArray(agg) ? (agg[0]?.count ?? 0) : 0;
      return {
        public_id: c.public_id,
        status: c.status,
        vehicle_maker: c.vehicle_maker,
        vehicle_model: c.vehicle_model,
        vehicle_plate: c.vehicle_plate,
        image_count,
        created_at: c.created_at,
        service_type: c.service_type,
      };
    });

    return apiJson({ certificates: result });
  } catch (e) {
    return apiInternalError(e, "customer-certificates");
  }
}
