import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { operationSigningMode } from "@/lib/webauthn/config";

export const runtime = "nodejs";

/** GET /api/webauthn/credentials — 本人の登録済み認証器一覧。 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("operator_credentials")
      .select("id, device_label, device_type, backed_up, created_at, last_used_at")
      .eq("user_id", caller.userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return apiInternalError(error, "webauthn/credentials list");

    // operation_signing_mode: フロントが「操作署名を求めるか」を判断する材料。
    // 既定 off ではフロントはセレモニーを一切走らせず現行挙動を維持する。
    return apiOk({ credentials: data ?? [], operation_signing_mode: operationSigningMode() });
  } catch (e) {
    return apiInternalError(e, "webauthn/credentials");
  }
}
