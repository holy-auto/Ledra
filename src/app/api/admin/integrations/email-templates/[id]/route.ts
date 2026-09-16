/**
 * DELETE /api/admin/integrations/email-templates/[id]
 *   → soft-deactivate (is_active=false). The render path falls back
 *   to the built-in default afterwards.
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
      .from("tenant_email_templates")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("is_active", true)
      .select("id")
      .maybeSingle();

    if (error) return apiInternalError(error, "integrations/email-templates DELETE");
    if (!data) return apiNotFound("template_not_found_or_inactive");

    return apiOk({ ok: true });
  },
  { permission: "settings:edit", routeName: "integrations/email-templates DELETE" },
);
