import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { ADDON_CATALOG, listEnabledAddons } from "@/lib/billing/addons";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenantId: z.string().uuid("tenantId は必須です"),
});

/**
 * GET /api/admin/platform/tenant-addons?tenantId=...
 *
 * Returns the addon catalog merged with each addon's current enabled state
 * for the requested tenant. Platform-admin only.
 */
export const GET = withCaller(
  async (req, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const url = new URL(req.url);
      const parsed = querySchema.safeParse({ tenantId: url.searchParams.get("tenantId") ?? "" });
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid query");
      }
      const { tenantId } = parsed.data;

      const admin = createPlatformScopedAdmin("platform/tenant-addons — manage any tenant's addons");

      const { data: tenant, error: tenantError } = await admin
        .from("tenants")
        .select("id, name")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant) {
        return apiNotFound("テナントが見つかりません");
      }

      const enabled = await listEnabledAddons(admin, tenantId);

      const addons = ADDON_CATALOG.map((entry) => ({
        key: entry.key,
        label: entry.label,
        description: entry.description,
        primaryRoute: entry.primaryRoute,
        enabled: enabled.has(entry.key),
      }));

      return apiJson({ ok: true, tenant: { id: tenant.id, name: tenant.name }, addons });
    } catch (e: unknown) {
      return apiInternalError(e, "platform/tenant-addons GET");
    }
  },
  { routeName: "admin/platform/tenant-addons GET" },
);
