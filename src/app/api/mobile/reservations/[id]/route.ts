import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── GET: Reservation detail ───
export async function GET(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:view")) return apiForbidden();

    const { id } = await params;

    const { data, error } = await caller.supabase
      .from("reservations")
      .select(
        `id, title, scheduled_date, start_time, end_time, status,
         payment_status, estimated_amount, customer_id, vehicle_id,
         menu_items_json, note, assigned_user_id, sub_status, progress_note,
         customers(name), vehicles(maker, model, plate_display)`,
      )
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
export async function PUT(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { id } = await params;
    const body = await request.json().catch(() => null);
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
      .select()
      .single();

    if (error || !data) return apiNotFound();

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservations.update");
  }
}
