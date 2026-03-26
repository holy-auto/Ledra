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

// ─── POST: Record NFC write event (prepared → written) ───
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "certificates:edit")) return apiForbidden();

    const { id } = await params;

    const { data: tag } = await caller.supabase
      .from("nfc_tags")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!tag) return apiNotFound();
    if (tag.status !== "prepared") {
      return apiValidationError(
        `Cannot write: current status is "${tag.status}", expected "prepared"`,
      );
    }

    const { data, error } = await caller.supabase
      .from("nfc_tags")
      .update({ status: "written", written_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "nfc.write");

    // Audit log
    await caller.supabase.from("audit_logs").insert({
      tenant_id: caller.tenantId,
      table_name: "nfc_tags",
      record_id: id,
      action: "nfc_tag_written",
      performed_by: caller.userId,
      ip_address:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip"),
    });

    return apiOk({ nfc_tag: data });
  } catch (e) {
    return apiInternalError(e, "nfc.write");
  }
}
