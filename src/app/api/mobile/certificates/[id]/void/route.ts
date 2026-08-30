import { parseJsonSafe } from "@/lib/api/safeJson";
import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
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

    const body = await parseJsonSafe(request);
    if (!body?.reason) {
      return apiValidationError("reason is required");
    }

    const { data: cert } = await caller.supabase
      .from("certificates")
      .select("id, status, public_id, meta")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound();
    if (cert.status !== "active") {
      return apiValidationError(`Cannot void: current status is "${cert.status}", expected "active"`);
    }

    // 取消理由の専用列は certificates に無い（void_reason は part_installations 側）。
    // Web の取消は理由を残していないが、モバイルは入力を必須にしているので
    // 捨てずに meta へ残す。既存の meta を潰さないよう読み込んでから重ねる
    const meta = { ...((cert.meta as Record<string, unknown> | null) ?? {}), void_reason: body.reason };

    const { data, error } = await caller.supabase
      .from("certificates")
      .update({ status: "void", meta })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, public_id, vehicle_id, tenant_id, status, meta, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "certificates.void");

    // Audit log
    await logTenantAuditEvent(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "certificate_voided",
      table: "certificates",
      recordId: id,
      targetPublicId: (cert.public_id as string | null) ?? null,
      extra: { void_reason: body.reason },
      req: request,
    });

    return apiOk({ certificate: data });
  } catch (e) {
    return apiInternalError(e, "certificates.void");
  }
}
