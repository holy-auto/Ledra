import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: Square インポート済みオーダー一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("per_page") ?? searchParams.get("limit") ?? "20", 10)),
    );
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const offset = (page - 1) * limit;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Fetch connection status for UI
    const { data: conn } = await admin
      .from("square_connections")
      .select("id, tenant_id, square_merchant_id, status, connected_at, last_synced_at, square_location_ids")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    let query = admin
      .from("square_orders")
      .select(
        "id, square_order_id, square_location_id, order_state, total_amount, tax_amount, net_amount, currency, payment_methods, square_customer_id, square_receipt_url, square_created_at, square_closed_at, customer_id, vehicle_id, certificate_id, note, synced_at, customers(id, name), vehicles(id, maker, model, plate_display)",
        { count: "exact" },
      )
      .eq("tenant_id", caller.tenantId)
      .order("square_created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) {
      query = query.gte("square_created_at", new Date(from).toISOString());
    }
    if (to) {
      query = query.lte("square_created_at", new Date(to).toISOString());
    }

    const { data: rows, count, error } = await query;

    if (error) {
      console.error("[square orders] query error:", error.message);
      return apiInternalError(error, "square orders GET");
    }

    // Map joined fields to flat shape expected by UI
    const orders = (rows ?? []).map((r: any) => ({
      ...r,
      customer_name: r.customers?.name ?? null,
      vehicle_display: r.vehicles
        ? [r.vehicles.maker, r.vehicles.model, r.vehicles.plate_display].filter(Boolean).join(" ")
        : null,
      customers: undefined,
      vehicles: undefined,
    }));

    const total = count ?? 0;
    return apiOk({
      orders,
      connection: conn,
      pagination: {
        page,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    return apiInternalError(e, "square orders GET");
  }
}
