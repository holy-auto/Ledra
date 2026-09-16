import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiOk, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { sanitizeFeatureKeys } from "@/lib/features/catalog";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET — current feature-visibility state for the sidebar / settings page.
 *
 * Reads are deliberately fault-tolerant: if the tables do not exist yet
 * (e.g. a preview deploy that ran ahead of the migration) we degrade to
 * "no advanced features shown" rather than breaking the entire admin
 * sidebar.
 */
export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

      let tenantDisabled: string[] = [];
      let userVisible: string[] = [];

      const { data: tRow, error: tErr } = await admin
        .from("tenant_feature_settings")
        .select("disabled_features")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!tErr && tRow?.disabled_features) {
        tenantDisabled = sanitizeFeatureKeys(tRow.disabled_features);
      }

      const { data: uRow, error: uErr } = await admin
        .from("user_feature_prefs")
        .select("visible_features")
        .eq("tenant_id", tenantId)
        .eq("user_id", caller.userId)
        .maybeSingle();
      if (!uErr && uRow?.visible_features) {
        userVisible = sanitizeFeatureKeys(uRow.visible_features);
      }

      return apiOk({ tenantDisabled, userVisible, role: caller.role });
    } catch (e: unknown) {
      return apiInternalError(e, "feature-prefs GET");
    }
  },
  { routeName: "admin/feature-prefs GET" },
);

const userPrefsSchema = z.object({
  visibleFeatures: z.array(z.string()).max(500),
});

/**
 * PUT — replace the caller's personal visible-feature list.
 *
 * Any authenticated tenant member may manage their own sidebar. Unknown
 * / core / non-string keys are dropped server-side so persisted state is
 * always a clean set of known advanced keys.
 */
export const PUT = withCaller(
  async (req, { caller }) => {
    try {
      const parsed = await parseJsonBody(req, userPrefsSchema);
      if (!parsed.ok) return parsed.response;

      const visibleFeatures = sanitizeFeatureKeys(parsed.data.visibleFeatures);

      const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
      const { error } = await admin.from("user_feature_prefs").upsert(
        {
          tenant_id: tenantId,
          user_id: caller.userId,
          visible_features: visibleFeatures,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,user_id" },
      );
      if (error) return apiInternalError(error, "feature-prefs PUT upsert");

      return apiOk({ visibleFeatures });
    } catch (e: unknown) {
      return apiInternalError(e, "feature-prefs PUT");
    }
  },
  { routeName: "admin/feature-prefs PUT" },
);
