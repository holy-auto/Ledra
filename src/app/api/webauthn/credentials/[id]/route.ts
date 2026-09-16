import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiOk, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";

/**
 * DELETE /api/webauthn/credentials/[id] — 本人の認証器をソフト失効(is_active=false)。
 * 監査のため行は物理削除せず残す。
 */
export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id } = params;

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("operator_credentials")
        .update({ is_active: false })
        .eq("id", id)
        .eq("user_id", caller.userId)
        .eq("is_active", true)
        .select("id")
        .maybeSingle();
      if (error) return apiInternalError(error, "webauthn/credentials delete");
      if (!data) return apiNotFound("認証器が見つかりません。");

      return apiOk({ deactivated: true, id });
    } catch (e) {
      return apiInternalError(e, "webauthn/credentials/[id]");
    }
  },
  { routeName: "webauthn/credentials/[id]" },
);
