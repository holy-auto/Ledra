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

// ─── POST: Check in reservation (confirmed → arrived) ───
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { id } = await params;

    // Fetch current reservation
    const { data: reservation } = await caller.supabase
      .from("reservations")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound();
    if (reservation.status !== "confirmed") {
      return apiValidationError(
        `Cannot check in: current status is "${reservation.status}", expected "confirmed"`,
      );
    }

    const { data, error } = await caller.supabase
      .from("reservations")
      .update({ status: "arrived" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "reservations.checkin");

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservations.checkin");
  }
}
