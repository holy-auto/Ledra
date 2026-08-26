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

// ─── POST: Record NFC attach (written → attached) ───
//
// Path param `[id]` は物理NFC UID (hex)。`uid` カラムで検索する。
// 既に attached の場合は冪等成功。lost/retired/prepared は 422。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "certificates:edit")) return apiForbidden();

    const { id: physicalUid } = await params;
    if (!physicalUid) {
      return apiValidationError("Physical NFC UID is required");
    }

    const { data: tag } = await caller.supabase
      .from("nfc_tags")
      .select("id, tenant_id, tag_code, certificate_id, status, attached_at, created_at, updated_at")
      .eq("uid", physicalUid)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!tag) return apiNotFound();

    // 冪等: 既に attached なら現状を返す
    if (tag.status === "attached") {
      return apiOk({ nfc_tag: tag });
    }

    if (tag.status !== "written") {
      return apiValidationError(`Cannot attach: current status is "${tag.status}", expected "written" or "attached"`);
    }

    const { data, error } = await caller.supabase
      .from("nfc_tags")
      .update({ status: "attached", attached_at: new Date().toISOString() })
      .eq("id", tag.id)
      .eq("tenant_id", caller.tenantId)
      .select("id, tenant_id, tag_code, certificate_id, status, attached_at, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "nfc.attach");

    // Audit log
    await logTenantAuditEvent(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "nfc_tag_attached",
      table: "nfc_tags",
      recordId: tag.id,
      req: request,
    });

    return apiOk({ nfc_tag: data });
  } catch (e) {
    return apiInternalError(e, "nfc.attach");
  }
}
