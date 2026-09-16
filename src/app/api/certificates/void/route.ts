import { parseJsonSafe } from "@/lib/api/safeJson";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { getRequestMeta } from "@/lib/audit/certificateLog";
import { voidCertificate } from "@/lib/certificates/voidCertificate";
import { certificateVoidSchema } from "@/lib/validations/certificate";

import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
/**
 * POST /api/certificates/void
 * 認証済み + `certificates:void`（admin 以上）が必要。
 * 互換のためこのパスを残しているが、正準のエンドポイントは
 * /api/admin/certificates/void。
 */
export const POST = withCaller(
  async (req, { caller }) => {
    try {
      // 認証・認可を入力検証より前に置く。逆順だと、未認証の呼び出しに対して
      // 401 ではなく 400 とスキーマのエラーメッセージを返し、critical 操作の
      // リクエスト仕様を無認証で読み取れてしまう。
      if (!caller) {
        return apiUnauthorized();
      }
      // 証明書の無効化は不可逆で法的意味を持つ (operationRisk = critical)。
      // 無効化の経路は全部で5本あり、ここだけテナント所属だけで通っていた
      // (viewer でも無効化できた)。5本すべてが同じ Permission を見ることは
      // src/lib/auth/__tests__/apiRoutePermissions.test.ts が強制する。

      const json = await parseJsonSafe(req);
      const parsed = certificateVoidSchema.safeParse(json);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
      }

      // 無効化の本体は `voidCertificate` に一本化してある（5経路で実装が食い違っていた）。
      // ここに残すのは認証・認可・入力検証・応答の組み立てだけ。
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const result = await voidCertificate(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        selector: { publicId: parsed.data.public_id },
        requestMeta: getRequestMeta(req),
      });

      if (!result.ok) {
        if (result.kind === "not_found") return apiNotFound("証明書が見つかりません。");
        return apiInternalError(result.kind === "update_failed" ? result.error : result.kind, "certificates/void update");
      }
      if (result.alreadyVoid) return apiOk({ already_void: true });

      return apiOk({});
    } catch (e) {
      return apiInternalError(e, "certificates/void");
    }
  },
  { permission: "certificates:void", routeName: "certificates/void" },
);
