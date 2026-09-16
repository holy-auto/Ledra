/**
 * DELETE /api/admin/platform/passport-consumers/[id]/keys/[keyId]
 *
 * Soft-revoke an API key (sets revoked_at). resolvePassportApiKey()
 * refuses any key with revoked_at != null, so the consumer's calls
 * 401 immediately. last_used_at and audit logs survive for billing
 * reconciliation.
 */
import { withCaller } from "@/lib/api/withCaller";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const DELETE = withCaller<{ id: string; keyId: string }>(
  async (_req, { caller, params }) => {
    const { id, keyId } = params;
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
  },
  { routeName: "passport-consumer key DELETE" },
);
