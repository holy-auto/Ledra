import { parseJsonSafe } from "@/lib/api/safeJson";
import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * Mobile-facing reservation fields. Explicit list to prevent
 * accidentally returning new schema columns (e.g. internal flags,
 * audit metadata) to the mobile app.
 */
const MOBILE_RESERVATION_COLUMNS =
  "id, title, scheduled_date, start_time, end_time, status, payment_status, estimated_amount, customer_id, vehicle_id, menu_items_json, note, assigned_user_id, sub_status, progress_note";

// ─── GET: List reservations for tenant ───
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:view")) return apiForbidden();

    const url = request.nextUrl;
    const storeId = url.searchParams.get("store_id");
    const date = url.searchParams.get("date");
    const status = url.searchParams.get("status");

    let query = caller.supabase
      .from("reservations")
      .select(`${MOBILE_RESERVATION_COLUMNS}, customers(name), vehicles(maker, model, plate_display)`)
      .eq("tenant_id", caller.tenantId)
      .order("scheduled_date", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);
    if (date) query = query.eq("scheduled_date", date);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "reservations.list");

    return apiOk({ reservations: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "reservations.list");
  }
}

// ─── POST: Create reservation ───
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:create")) return apiForbidden();

    const body = await parseJsonSafe(request);
    if (!body) return apiValidationError("Invalid request body");

    const { scheduled_date, customer_id } = body;
    if (!scheduled_date) return apiValidationError("scheduled_date is required");
    if (!customer_id) return apiValidationError("customer_id is required");

    const storeId = body.store_id ?? request.nextUrl.searchParams.get("store_id") ?? undefined;

    const { data, error } = await caller.supabase
      .from("reservations")
      .insert({
        tenant_id: caller.tenantId,
        scheduled_date,
        customer_id,
        vehicle_id: body.vehicle_id ?? null,
        title: body.title ?? null,
        menu_items_json: body.menu_items_json ?? null,
        start_time: body.start_time ?? null,
        end_time: body.end_time ?? null,
        note: body.note ?? null,
        assigned_user_id: body.assigned_user_id ?? null,
        store_id: storeId ?? null,
        estimated_amount: body.estimated_amount ?? null,
        status: "confirmed",
        created_by: caller.userId,
      })
      .select(MOBILE_RESERVATION_COLUMNS)
      .single();

    if (error) return apiInternalError(error, "reservations.create");

    return apiOk({ reservation: data }, 201);
  } catch (e) {
    return apiInternalError(e, "reservations.create");
  }
}
