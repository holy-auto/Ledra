/**
 * POST /api/admin/mfa/enroll
 *
 * 現在ログイン中の admin / super_admin が TOTP 2FA を登録する。
 * レスポンスの `uri` を QR コード化してクライアントに表示。
 * その後 /api/admin/mfa/verify-enroll で 6 桁コードを送信して有効化する。
 */

import { apiOk, apiInternalError, apiError } from "@/lib/api/response";
import { enrollTotp } from "@/lib/auth/mfa";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const POST = withCaller(
  async (_req, { caller, supabase }) => {
    try {

      const r = await enrollTotp(supabase);
      if (!r.ok) {
        return apiError({ code: "auth_error", message: r.error, status: 400 });
      }

      return apiOk({
        factor_id: r.data.factor_id,
        uri: r.data.uri,
        secret: r.data.secret,
      });
    } catch (e) {
      return apiInternalError(e, "admin/mfa/enroll");
    }
  },
  { routeName: "admin/mfa/enroll" },
);
