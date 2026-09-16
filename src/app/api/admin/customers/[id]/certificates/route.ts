import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/[id]/certificates
 *
 * Returns all certificates for a specific customer, ordered by created_at desc.
 * Includes vehicle info and image count per certificate.
 */
export const GET = withCaller<{ id: string }>(
  async (_req, { caller, supabase, params }) => {
    try {
      const { id: customerId } = params;

      // Fetch certificates for this customer within the caller's tenant。
      // 画像枚数は埋め込み集約 (certificate_images(count)) で DB 側で数える。
      // 以前は全画像行を取得して JS でカウントしていた (N+1 的な過剰取得) のを解消。
      const { data: certificates, error } = await supabase
        .from("certificates")
        .select("id, public_id, status, vehicle_info_json, created_at, service_type, certificate_images(count)")
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
          // 車両情報は certificates の列ではなく vehicle_info_json に入る
          vehicle_maker: (c.vehicle_info_json as { maker?: string } | null)?.maker ?? null,
          vehicle_model: (c.vehicle_info_json as { model?: string } | null)?.model ?? null,
          vehicle_plate: (c.vehicle_info_json as { plate?: string } | null)?.plate ?? null,
          image_count,
          created_at: c.created_at,
          service_type: c.service_type,
        };
      });

      return apiJson({ certificates: result });
    } catch (e) {
      return apiInternalError(e, "customer-certificates");
    }
  },
  { minRole: "staff", routeName: "customer-certificates" },
);
