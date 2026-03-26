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

// ─── POST: Activate certificate (draft → active) ───
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "certificates:edit")) return apiForbidden();

    const { id } = await params;

    const { data: cert } = await caller.supabase
      .from("certificates")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound();
    if (cert.status !== "draft") {
      return apiValidationError(
        `Cannot activate: current status is "${cert.status}", expected "draft"`,
      );
    }

    const { data, error } = await caller.supabase
      .from("certificates")
      .update({ status: "active" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "certificates.activate");

    // Audit log
    await caller.supabase.from("audit_logs").insert({
      tenant_id: caller.tenantId,
      table_name: "certificates",
      record_id: id,
      action: "certificate_activated",
      performed_by: caller.userId,
      ip_address:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip"),
    });

    return apiOk({ certificate: data });
  } catch (e) {
    return apiInternalError(e, "certificates.activate");
  }
}
