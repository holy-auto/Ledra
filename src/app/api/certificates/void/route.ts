import { parseJsonSafe } from "@/lib/api/safeJson";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { certificateVoidSchema } from "@/lib/validations/certificate";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";

/**
 * POST /api/certificates/void
 * Authenticated void endpoint — requires logged-in user with tenant membership.
 * Kept at this path for backward compatibility; the canonical endpoint is
 * /api/admin/certificates/void.
 */
export async function POST(req: Request) {
  try {
    const json = await parseJsonSafe(req);
    const parsed = certificateVoidSchema.safeParse(json);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
    }

    const supabase = await createSupabaseServerClient();

    // Auth check
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    // 証明書の無効化は不可逆で法的意味を持つ (operationRisk = critical)。
    // 同じ操作の他2経路 (admin/certificates/void, mobile/certificates/[id]/void) は
    // admin 以上を要求しているのに、ここだけテナント所属だけで通っていた。
    if (!requirePermission(caller, "certificates:void")) {
      return apiForbidden("証明書無効化の権限がありません。");
    }

    const tenantId = caller.tenantId;

    // Verify certificate belongs to this tenant
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: cert, error: fetchErr } = await admin
      .from("certificates")
      .select("id, vehicle_id, status")
      .eq("tenant_id", tenantId)
      .eq("public_id", parsed.data.public_id)
      .limit(1)
      .maybeSingle();

    if (fetchErr || !cert) {
      return apiNotFound("証明書が見つかりません。");
    }

    if (String(cert.status ?? "").toLowerCase() === "void") {
      return apiOk({ already_void: true });
    }

    const { error } = await admin
      .from("certificates")
      .update({ status: "void", updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("public_id", parsed.data.public_id);

    if (error) {
      return apiInternalError(error, "certificates/void update");
    }

    // Audit log (fire-and-forget)
    const { ip, userAgent } = getRequestMeta(req);
    logCertificateAction({
      type: "certificate_voided",
      tenantId,
      publicId: parsed.data.public_id,
      certificateId: cert.id,
      vehicleId: cert.vehicle_id ?? null,
      userId: caller.userId,
      description: "証明書を無効化 (void)",
      ip,
      userAgent,
    });

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "certificates/void");
  }
}
