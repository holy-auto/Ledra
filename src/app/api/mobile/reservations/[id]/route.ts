import { parseJsonSafe } from "@/lib/api/safeJson";
import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** Mobile-facing reservation fields. Explicit list to gate schema additions. */
const MOBILE_RESERVATION_COLUMNS =
  "id, title, scheduled_date, start_time, end_time, status, payment_status, estimated_amount, customer_id, vehicle_id, menu_items_json, note, assigned_user_id, sub_status, progress_note";

// ─── GET: Reservation detail ───
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:view")) return apiForbidden();

    const { id } = await params;

    const { data, error } = await caller.supabase
      .from("reservations")
      .select(`${MOBILE_RESERVATION_COLUMNS}, customers(name), vehicles(maker, model, plate_display)`)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (error || !data) return apiNotFound();

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservations.get");
  }
}

// ─── PUT: Update reservation ───
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { id } = await params;
    const body = await parseJsonSafe(request);
    if (!body) return apiNotFound();

    // Only allow safe fields to be updated
    const allowedFields = [
      "title",
      "scheduled_date",
      "start_time",
      "end_time",
      "customer_id",
      "vehicle_id",
      "menu_items_json",
      "note",
      "assigned_user_id",
      "store_id",
      "estimated_amount",
      "sub_status",
      "progress_note",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await caller.supabase
      .from("reservations")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(MOBILE_RESERVATION_COLUMNS)
      .single();

    if (error || !data) return apiNotFound();

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservations.update");
  }
}
