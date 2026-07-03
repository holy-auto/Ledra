import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  certificateHasRequiredPhotos,
  CERTIFICATE_PHOTO_REQUIRED_MESSAGE,
  certificateHasRequiredBeforeAfterMedia,
  CERTIFICATE_BEFORE_AFTER_REQUIRED_MESSAGE,
} from "@/lib/certificates/photoRequirement";
import { triggerCertificateIssued } from "@/lib/certificates/issueHooks";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["active", "void", "draft"] as const;
type CertStatus = (typeof VALID_STATUSES)[number];

const certStatusSchema = z.object({
  public_id: z.string().trim().min(1, "public_id は必須です。"),
  status: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(VALID_STATUSES, { message: "status は active / void / draft のいずれかを指定してください。" })),
});

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

/**
 * PUT /api/admin/certificates/status
 * Body: { public_id: string, status: "active" | "void" | "draft" }
 */
export async function PUT(req: Request) {
  try {
    const parsed = certStatusSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { public_id: publicId, status: newStatus } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Base minimum role: staff
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Fetch current certificate (scoped to caller's tenant)
    const { data: cert, error: fetchErr } = await admin
      .from("certificates")
      .select("id, vehicle_id, status, customer_id, customer_name, vehicle_info_json, service_type, created_by")
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
      return apiValidationError(`ステータス遷移 ${currentStatus} → ${newStatus} は許可されていません。`);
    }

    // Check the role required for this specific transition
    if (!requireMinRole(caller, transition.minRole)) {
      return apiForbidden(`${currentStatus} → ${newStatus} の遷移には ${transition.minRole} 以上の権限が必要です。`);
    }

    // 写真添付必須ルール: active 化 (draft→active / void→active) は施工写真が
    // 1 枚以上ある場合のみ許可する (全テナント一律・サーバ強制)。
    if (newStatus === "active") {
      const hasPhotos = await certificateHasRequiredPhotos(admin, cert.id as string);
      if (!hasPhotos) {
        return apiValidationError(CERTIFICATE_PHOTO_REQUIRED_MESSAGE);
      }
      const hasBeforeAfter = await certificateHasRequiredBeforeAfterMedia(
        admin,
        cert.id as string,
        cert.service_type as string | null,
      );
      if (!hasBeforeAfter) {
        return apiValidationError(CERTIFICATE_BEFORE_AFTER_REQUIRED_MESSAGE);
      }
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

    // 初回発行 (draft→active) のみ発行副作用を発火する。void→active の再発行では
    // 二重通知を避けるため発火しない。
    if (currentStatus === "draft" && newStatus === "active") {
      const vinfo = (cert.vehicle_info_json ?? {}) as { model?: string; plate?: string };
      triggerCertificateIssued({
        tenantId: caller.tenantId,
        publicId,
        certificateId: cert.id as string,
        customerName: (cert.customer_name as string | null) ?? "",
        customerId: (cert.customer_id as string | null) ?? null,
        vehicleModel: vinfo.model ?? null,
        vehiclePlate: vinfo.plate ?? null,
        serviceType: (cert.service_type as string | null) ?? null,
        createdBy: (cert.created_by as string | null) ?? caller.userId,
      }).catch(() => {
        /* fire-and-forget: issueHooks 内で log 済み */
      });
    }

    // draft→active 以外の状態遷移 (void 化 / 再発行 等) でも証明書レコードの新しい
    // digest を anchor queue に積む (draft→active は上の issueHooks 側で enqueue 済み)。
    if (!(currentStatus === "draft" && newStatus === "active")) {
      // best-effort fire-and-forget (triggerCertificateIssued と同様)。enqueue は throw しない。
      enqueueCertificateAnchor({ tenantId: caller.tenantId, certificateId: cert.id as string }).catch(() => {});
    }

    return apiOk({ certificate: updated });
  } catch (e) {
    return apiInternalError(e, "admin/certificates/status");
  }
}
