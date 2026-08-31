import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiInternalError, apiOk, apiUnauthorized } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

export const dynamic = "force-dynamic";

const displayModeSchema = z.enum(["simple", "standard", "dense"]);
const updateSchema = z
  .object({
    displayMode: displayModeSchema.optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .refine((value) => value.displayMode !== undefined || value.onboardingCompleted !== undefined);

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("user_interface_preferences")
      .select("display_mode, onboarding_completed_at")
      .eq("tenant_id", tenantId)
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (error) return apiInternalError(error, "mobile.ui-preferences GET");

    return apiOk({
      displayMode: displayModeSchema.safeParse(data?.display_mode).success ? data?.display_mode : "standard",
      onboardingCompleted: Boolean(data?.onboarding_completed_at),
    });
  } catch (error: unknown) {
    return apiInternalError(error, "mobile.ui-preferences GET");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: existing, error: readError } = await admin
      .from("user_interface_preferences")
      .select("display_mode, onboarding_completed_at")
      .eq("tenant_id", tenantId)
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (readError) return apiInternalError(readError, "mobile.ui-preferences PUT read");

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
    if (error) return apiInternalError(error, "mobile.ui-preferences PUT upsert");

    return apiOk({ displayMode, onboardingCompleted: Boolean(onboardingCompletedAt) });
  } catch (error: unknown) {
    return apiInternalError(error, "mobile.ui-preferences PUT");
  }
}
