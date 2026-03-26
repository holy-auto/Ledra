import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: Create customer-facing progress event ───
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { reservationId } = await params;

    const body = await request.json().catch(() => null);
    if (!body?.progress_label) {
      return apiValidationError("progress_label is required");
    }

    // Look up reservation to get vehicle_id
    const { data: reservation } = await caller.supabase
      .from("reservations")
      .select("id, vehicle_id")
      .eq("id", reservationId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound();
    if (!reservation.vehicle_id) {
      return apiValidationError(
        "Reservation has no vehicle_id assigned",
      );
    }

    const { data, error } = await caller.supabase
      .from("vehicle_histories")
      .insert({
        tenant_id: caller.tenantId,
        vehicle_id: reservation.vehicle_id,
        reservation_id: reservationId,
        label: body.progress_label,
        note: body.note ?? null,
        is_public: true,
        created_by: caller.userId,
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "progress.create");

    return apiOk({ history: data }, 201);
  } catch (e) {
    return apiInternalError(e, "progress.create");
  }
}
