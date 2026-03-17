import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound, apiForbidden } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const publicId = (body?.public_id ?? "").trim();

    if (!publicId) {
      return apiValidationError("public_id は必須です。");
    }

    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("証明書無効化の権限がありません。");
    }

    const userRes = { user: { id: caller.userId } };
    const tenantId = caller.tenantId;

    // tenant_id で絞ることで他テナントの証明書は操作不可
    const existing = await supabase
      .from("certificates")
      .select("id, vehicle_id, status")
      .eq("tenant_id", tenantId)
      .eq("public_id", publicId)
      .limit(1)
      .maybeSingle();

    if (existing.error || !existing.data) {
      return apiNotFound("証明書が見つかりません。");
    }

    if (String(existing.data.status ?? "").toLowerCase() === "void") {
      return apiOk({ already_void: true });
    }

    const { error: updateErr } = await supabase
      .from("certificates")
      .update({ status: "void", updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("public_id", publicId);

    if (updateErr) {
      return apiInternalError(updateErr, "admin/certificates/void update");
    }

    // Audit log (fire-and-forget)
    const { ip, userAgent } = getRequestMeta(req);
    logCertificateAction({
      type: "certificate_voided",
      tenantId,
      publicId,
      certificateId: existing.data.id,
      vehicleId: existing.data.vehicle_id ?? null,
      userId: userRes.user.id,
      description: `証明書を無効化 (void)`,
      ip,
      userAgent,
    });

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "admin/certificates/void");
  }
}
