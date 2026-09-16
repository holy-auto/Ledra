/**
 * DELETE /api/admin/integrations/api-keys/[id] — revoke (sets revoked_at).
 *
 * Soft-revoke (rather than physical delete) so audit trails and last_used_at
 * survive. resolveTenantApiKey() refuses any key with revoked_at != null.
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiNotFound, apiInternalError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";

export const dynamic = "force-dynamic";

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const { id } = params;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) return apiInternalError(error, "integrations/api-keys DELETE");
    if (!data) return apiNotFound("api_key_not_found_or_already_revoked");

    return apiOk({ ok: true });
  },
  { permission: "settings:edit", routeName: "integrations/api-keys DELETE" },
);
