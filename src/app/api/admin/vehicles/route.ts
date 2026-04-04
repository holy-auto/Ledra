import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { parsePagination } from "@/lib/api/pagination";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** GET: テナントの全車両を取得（顧客情報付き） */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customer_id");
    const pagination = parsePagination(req);

    let query = supabase
      .from("vehicles")
      .select("id, maker, model, year, plate_display, vin_code, customer_id, customer:customers(id, name)", { count: "exact" })
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    // Apply pagination if page param was provided
    if (pagination.page > 0) {
      query = query.range(pagination.from, pagination.to);
    }

    const { data: vehicles, error, count } = await query;

    if (error) {
      return apiInternalError(error, "admin/vehicles GET");
    }

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return NextResponse.json({
      vehicles: vehicles ?? [],
      ...(pagination.page > 0 && { page: pagination.page, per_page: pagination.perPage, total: count ?? 0 }),
    }, { headers });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/vehicles GET");
  }
}
