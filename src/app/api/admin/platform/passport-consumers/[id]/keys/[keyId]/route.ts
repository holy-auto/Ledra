/**
 * DELETE /api/admin/platform/passport-consumers/[id]/keys/[keyId]
 *
 * Soft-revoke an API key (sets revoked_at). resolvePassportApiKey()
 * refuses any key with revoked_at != null, so the consumer's calls
 * 401 immediately. last_used_at and audit logs survive for billing
 * reconciliation.
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; keyId: string }> }) {
  try {
    const { id, keyId } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("passport-consumer key revoke — soft revoke (revoked_at)");

    const { data, error } = await admin
      .from("passport_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("consumer_id", id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) return apiInternalError(error, "passport-consumer key DELETE");
    if (!data) return apiNotFound("key_not_found_or_already_revoked");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "passport-consumer key DELETE");
  }
}
