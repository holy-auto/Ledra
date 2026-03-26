import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasPermission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { apiForbidden } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

/** GET: テナントの証明書一覧（vehicle_id でフィルタ可能） */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!hasPermission(caller.role as Role, "certificates:view")) return apiForbidden();

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
      query = query.or(
        `public_id.ilike.%${q}%,customer_name.ilike.%${q}%,plate_display.ilike.%${q}%,vehicle_maker.ilike.%${q}%,vehicle_model.ilike.%${q}%`,
      );
    }

    const { data: certificates, error } = await query;

    if (error) {
      console.error("[admin/certificates] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ certificates: certificates ?? [] });
  } catch (e: any) {
    console.error("admin certificates list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
