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

// ─── POST: Void certificate (active → void) ───
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "certificates:void")) return apiForbidden();

    const { id } = await params;

    const body = await request.json().catch((): null => null);
    if (!body?.reason) {
      return apiValidationError("reason is required");
    }

    const { data: cert } = await caller.supabase
      .from("certificates")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound();
    if (cert.status !== "active") {
      return apiValidationError(`Cannot void: current status is "${cert.status}", expected "active"`);
    }

    const { data, error } = await caller.supabase
      .from("certificates")
      .update({ status: "void", void_reason: body.reason })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, public_id, vehicle_id, tenant_id, status, void_reason, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "certificates.void");

    // Audit log
    await caller.supabase.from("audit_logs").insert({
      tenant_id: caller.tenantId,
      table_name: "certificates",
      record_id: id,
      action: "certificate_voided",
      performed_by: caller.userId,
      ip_address: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    });

    return apiOk({ certificate: data });
  } catch (e) {
    return apiInternalError(e, "certificates.void");
  }
}
