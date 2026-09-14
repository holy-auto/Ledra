import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/audit/certificateLog";
import { voidCertificate } from "@/lib/certificates/voidCertificate";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { certificateVoidSchema } from "@/lib/validations/certificate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 認証・認可を入力検証より前に置く（未認証に 400 でスキーマを教えない）。
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    // 3経路で同じ Permission を見る (requireMinRole("admin") と現状は等価だが、
    // ロール束と権限の対応が変わったときに経路ごとにズレない)。
    if (!requirePermission(caller, "certificates:void")) {
      return apiForbidden("証明書無効化の権限がありません。");
    }

    const parsed = certificateVoidSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { public_id: publicId } = parsed.data;

    // 無効化の本体は `voidCertificate` に一本化（5経路で実装が食い違っていた）。
    // ユーザースコープのクライアントをそのまま渡す（信頼境界を変えない）。
    const result = await voidCertificate(supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      selector: { publicId },
      requestMeta: getRequestMeta(req),
    });

    if (!result.ok) {
      if (result.kind === "not_found") return apiNotFound("証明書が見つかりません。");
      return apiInternalError(
        result.kind === "update_failed" ? result.error : result.kind,
        "admin/certificates/void update",
      );
    }
    if (result.alreadyVoid) return apiOk({ already_void: true });

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "admin/certificates/void");
  }
}
