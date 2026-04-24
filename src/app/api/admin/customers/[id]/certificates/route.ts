import { NextRequest, NextResponse } from "next/server";
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

    // Fetch certificates for this customer within the caller's tenant
    const { data: certificates, error } = await supabase
      .from("certificates")
      .select("id, public_id, status, vehicle_maker, vehicle_model, vehicle_plate, created_at, service_type")
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[customer-certificates] db_error:", error.message);
      return apiInternalError(error, "customer-certificates");
    }

    const rows = certificates ?? [];

    // Fetch image counts per certificate
    const imageCounts: Record<string, number> = {};
    if (rows.length > 0) {
      const certIds = rows.map((c) => c.id);
      const { data: images } = await supabase
        .from("certificate_images")
        .select("certificate_id")
        .in("certificate_id", certIds);

      (images ?? []).forEach((img) => {
        if (img.certificate_id) {
          imageCounts[img.certificate_id] = (imageCounts[img.certificate_id] || 0) + 1;
        }
      });
    }

    const result = rows.map((c) => ({
      public_id: c.public_id,
      status: c.status,
      vehicle_maker: c.vehicle_maker,
      vehicle_model: c.vehicle_model,
      vehicle_plate: c.vehicle_plate,
      image_count: imageCounts[c.id] || 0,
      created_at: c.created_at,
      service_type: c.service_type,
    }));

    return apiJson({ certificates: result });
  } catch (e) {
    return apiInternalError(e, "customer-certificates");
  }
}
