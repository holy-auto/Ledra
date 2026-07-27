import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * DELETE /api/webauthn/credentials/[id] — 本人の認証器をソフト失効(is_active=false)。
 * 監査のため行は物理削除せず残す。
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

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
}
