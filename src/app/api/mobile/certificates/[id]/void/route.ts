import { parseJsonSafe } from "@/lib/api/safeJson";
import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
import { voidCertificate } from "@/lib/certificates/voidCertificate";
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

    // 無効化の本体は `voidCertificate` に一本化（5経路で実装が食い違っていた）。
    // ここだけ `updated_at` を書いていなかったが、一本化で揃う。
    // 証明書監査ログもここだけ残っていなかったが、同じく揃う（テナントログは従来どおり別に残す）。
    const result = await voidCertificate(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      selector: { certificateId: id },
      reason: body.reason,
      requireActive: true,
      requestMeta: { userAgent: request.headers.get("user-agent") },
    });

    if (!result.ok) {
      if (result.kind === "not_found") return apiNotFound();
      if (result.kind === "not_active") {
        return apiValidationError(`Cannot void: current status is "${result.currentStatus}", expected "active"`);
      }
      return apiInternalError(result.error, "certificates.void");
    }

    // Audit log
    await logTenantAuditEvent(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "certificate_voided",
      table: "certificates",
      recordId: id,
      targetPublicId: result.certificate.publicId,
      extra: { void_reason: body.reason },
      req: request,
    });

    // 応答のキーは従来どおり snake_case を保つ（この API 面の慣習。呼び出し側は
    // `onSuccess` で invalidate するだけで本文を読んでいないが、古いビルドが
    // 入っている端末があり得るので形は変えない）。
    // `tenant_id` / `created_at` は誰も読んでいないので echo をやめた。
    const c = result.certificate;
    return apiOk({
      certificate: { id: c.id, public_id: c.publicId, vehicle_id: c.vehicleId, status: c.status, meta: c.meta },
    });
  } catch (e) {
    return apiInternalError(e, "certificates.void");
  }
}
