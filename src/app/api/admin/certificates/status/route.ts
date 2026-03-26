import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["active", "void", "draft"] as const;
type CertStatus = (typeof VALID_STATUSES)[number];

/**
 * Allowed status transitions:
 *  draft  -> active  (staff+)
 *  active -> void    (staff+)
 *  void   -> active  (admin+ only)
 */
const TRANSITIONS: Record<string, { to: CertStatus; minRole: "staff" | "admin" }[]> = {
  draft: [{ to: "active", minRole: "staff" }],
  active: [{ to: "void", minRole: "staff" }],
  void: [{ to: "active", minRole: "admin" }],
};

function isValidStatus(v: unknown): v is CertStatus {
  return typeof v === "string" && VALID_STATUSES.includes(v as CertStatus);
}

/**
 * PUT /api/admin/certificates/status
 * Body: { public_id: string, status: "active" | "void" | "draft" }
 */
export async function PUT(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => null);
    const publicId = (body?.public_id ?? "").trim();
    const newStatus = (body?.status ?? "").trim().toLowerCase();

    if (!publicId) {
      return apiValidationError("public_id は必須です。");
    }
    if (!isValidStatus(newStatus)) {
      return apiValidationError("status は active / void / draft のいずれかを指定してください。");
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Base minimum role: staff
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    const admin = createAdminClient();

    // Fetch current certificate (scoped to caller's tenant)
    const { data: cert, error: fetchErr } = await admin
      .from("certificates")
      .select("id, vehicle_id, status")
      .eq("tenant_id", caller.tenantId)
      .eq("public_id", publicId)
      .limit(1)
      .maybeSingle();

    if (fetchErr || !cert) {
      return apiNotFound("証明書が見つかりません。");
    }

    const currentStatus = String(cert.status ?? "").toLowerCase() as CertStatus;

    // Already in the target status
    if (currentStatus === newStatus) {
      return apiOk({ already: true, status: newStatus });
    }

    // Check if transition is allowed
    const allowed = TRANSITIONS[currentStatus];
    const transition = allowed?.find((t) => t.to === newStatus);
    if (!transition) {
      return apiValidationError(
        `ステータス遷移 ${currentStatus} → ${newStatus} は許可されていません。`,
      );
    }

    // Check the role required for this specific transition
    if (!requireMinRole(caller, transition.minRole)) {
      return apiForbidden(
        `${currentStatus} → ${newStatus} の遷移には ${transition.minRole} 以上の権限が必要です。`,
      );
    }

    // Perform the update via admin client (bypasses RLS)
    const { data: updated, error: updateErr } = await admin
      .from("certificates")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("tenant_id", caller.tenantId)
      .eq("public_id", publicId)
      .select("id, public_id, status, vehicle_id, customer_id, created_at, updated_at")
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "admin/certificates/status update");
    }

    // Audit log (fire-and-forget)
    const { ip, userAgent } = getRequestMeta(req);
    const auditType = newStatus === "void" ? "certificate_voided" : "certificate_issued";
    logCertificateAction({
      type: auditType,
      tenantId: caller.tenantId,
      publicId,
      certificateId: cert.id,
      vehicleId: cert.vehicle_id ?? null,
      userId: caller.userId,
      description: `ステータス変更: ${currentStatus} → ${newStatus}`,
      ip,
      userAgent,
    });

    return apiOk({ certificate: updated });
  } catch (e) {
    return apiInternalError(e, "admin/certificates/status");
  }
}
