import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiInternalError, apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const displayModeSchema = z.enum(["simple", "standard", "dense"]);
const updateSchema = z
  .object({
    displayMode: displayModeSchema.optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .refine((value) => value.displayMode !== undefined || value.onboardingCompleted !== undefined);

export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("user_interface_preferences")
        .select("display_mode, onboarding_completed_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", caller.userId)
        .maybeSingle();

      if (error) return apiInternalError(error, "ui-preferences GET");
      return apiOk({
        displayMode: displayModeSchema.safeParse(data?.display_mode).success ? data?.display_mode : "standard",
        onboardingCompleted: Boolean(data?.onboarding_completed_at),
      });
    } catch (error: unknown) {
      return apiInternalError(error, "ui-preferences GET");
    }
  },
  { routeName: "admin/ui-preferences GET" },
);

export const PUT = withCaller(
  async (req, { caller }) => {
    try {
      const parsed = await parseJsonBody(req, updateSchema);
      if (!parsed.ok) return parsed.response;

      const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
      const { data: existing, error: readError } = await admin
        .from("user_interface_preferences")
        .select("display_mode, onboarding_completed_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", caller.userId)
        .maybeSingle();
      if (readError) return apiInternalError(readError, "ui-preferences PUT read");

      const displayMode = parsed.data.displayMode ?? existing?.display_mode ?? "standard";
      const onboardingCompletedAt =
        parsed.data.onboardingCompleted === undefined
          ? (existing?.onboarding_completed_at ?? null)
          : parsed.data.onboardingCompleted
            ? new Date().toISOString()
            : null;

      const { error } = await admin.from("user_interface_preferences").upsert(
        {
          tenant_id: tenantId,
          user_id: caller.userId,
          display_mode: displayMode,
          onboarding_completed_at: onboardingCompletedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,user_id" },
      );
      if (error) return apiInternalError(error, "ui-preferences PUT upsert");

      return apiOk({ displayMode, onboardingCompleted: Boolean(onboardingCompletedAt) });
    } catch (error: unknown) {
      return apiInternalError(error, "ui-preferences PUT");
    }
  },
  { routeName: "admin/ui-preferences PUT" },
);
