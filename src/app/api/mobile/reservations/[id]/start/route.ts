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

export const dynamic = "force-dynamic";

// ─── POST: Start reservation (arrived → in_progress) ───
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { id } = await params;

    const { data: reservation } = await caller.supabase
      .from("reservations")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound();
    if (reservation.status !== "arrived") {
      return apiValidationError(
        `Cannot start: current status is "${reservation.status}", expected "arrived"`,
      );
    }

    const { data, error } = await caller.supabase
      .from("reservations")
      .update({ status: "in_progress" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "reservations.start");

    return apiOk({ reservation: data });
  } catch (e) {
    return apiInternalError(e, "reservations.start");
  }
}
