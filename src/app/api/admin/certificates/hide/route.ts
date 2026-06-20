import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
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
import { certificateHideSchema } from "@/lib/validations/certificate";

export const dynamic = "force-dynamic";

/**
 * 施工証明書の「非表示 / 再表示」を切り替える。
 * void (無効化) とは独立しており、ステータスは変更しない。
 * ミスのある証明書を一覧から隠して管理しやすくするための機能。
 */
export async function POST(req: Request) {
  try {
    const parsed = certificateHideSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { public_id: publicId, hidden } = parsed.data;

    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("証明書の表示設定を変更する権限がありません。");
    }

    const tenantId = caller.tenantId;

    // tenant_id で絞ることで他テナントの証明書は操作不可
    const existing = await supabase
      .from("certificates")
      .select("id, vehicle_id, is_hidden")
      .eq("tenant_id", tenantId)
      .eq("public_id", publicId)
      .limit(1)
      .maybeSingle();

    if (existing.error || !existing.data) {
      return apiNotFound("証明書が見つかりません。");
    }

    if (Boolean(existing.data.is_hidden) === hidden) {
      return apiOk({ unchanged: true, is_hidden: hidden });
    }

    const { error: updateErr } = await supabase
      .from("certificates")
      .update({ is_hidden: hidden, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("public_id", publicId);

    if (updateErr) {
      return apiInternalError(updateErr, "admin/certificates/hide update");
    }

    // Audit log (fire-and-forget)
    const { ip, userAgent } = getRequestMeta(req);
    logCertificateAction({
      type: "certificate_edited",
      tenantId,
      publicId,
      certificateId: existing.data.id,
      vehicleId: existing.data.vehicle_id ?? null,
      userId: caller.userId,
      description: hidden ? "証明書を非表示にしました" : "証明書を再表示しました",
      ip,
      userAgent,
    });

    return apiOk({ is_hidden: hidden });
  } catch (e) {
    return apiInternalError(e, "admin/certificates/hide");
  }
}
