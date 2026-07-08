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
import { parseJsonBody } from "@/lib/api/parseBody";
import { mobileProgressEventSchema } from "@/lib/validations/mobile";

export const dynamic = "force-dynamic";

// ─── POST: Create customer-facing progress event ───
export async function POST(request: NextRequest, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { reservationId } = await params;

    const parsed = await parseJsonBody(request, mobileProgressEventSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Look up reservation to get vehicle_id
    const { data: reservation } = await caller.supabase
      .from("reservations")
      .select("id, vehicle_id")
      .eq("id", reservationId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound();
    if (!reservation.vehicle_id) {
      return apiValidationError("Reservation has no vehicle_id assigned");
    }

    const { data, error } = await caller.supabase
      .from("vehicle_histories")
      .insert({
        tenant_id: caller.tenantId,
        vehicle_id: reservation.vehicle_id,
        type: "progress_update",
        title: body.progress_label,
        description: body.note ?? null,
        performed_at: new Date().toISOString(),
      })
      .select("id, vehicle_id, type, title, description, created_at")
      .single();

    if (error) return apiInternalError(error, "progress.create");

    return apiOk({ history: data }, 201);
  } catch (e) {
    return apiInternalError(e, "progress.create");
  }
}
