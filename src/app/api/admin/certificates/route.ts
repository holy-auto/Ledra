import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { parsePagination } from "@/lib/api/pagination";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** GET: テナントの証明書一覧（vehicle_id でフィルタ可能） */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicle_id");
    const q = (searchParams.get("q") ?? "").trim();
    const includeVehicle = searchParams.get("include_vehicle") === "true";
    const { perPage } = parsePagination(req, { maxPerPage: 200 });

    const baseFields = "id, public_id, status, vehicle_id, customer_id, customer_name, created_at";
    const selectFields = includeVehicle
      ? `${baseFields}, vehicle:vehicles!vehicle_id(id, maker, model, plate_display)`
      : baseFields;

    let query = supabase
      .from("certificates")
      .select(selectFields)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(perPage);

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    if (q) {
      // Search by public_id, customer_name, or vehicle-related fields
      // plate_display and vehicle_maker/vehicle_model are denormalized on the certificates table
      const safeQ = escapePostgrestValue(escapeIlike(q));
      query = query.or(
        `public_id.ilike.%${safeQ}%,customer_name.ilike.%${safeQ}%,plate_display.ilike.%${safeQ}%,vehicle_maker.ilike.%${safeQ}%,vehicle_model.ilike.%${safeQ}%`,
      );
    }

    const { data: certificates, error } = await query;

    if (error) {
      return apiInternalError(error, "admin/certificates GET");
    }

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return NextResponse.json({ certificates: certificates ?? [] }, { headers });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/certificates GET");
  }
}
