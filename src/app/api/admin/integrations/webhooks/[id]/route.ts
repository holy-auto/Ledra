/**
 * PATCH  /api/admin/integrations/webhooks/[id] — toggle active / change topics / url
 * DELETE /api/admin/integrations/webhooks/[id] — remove subscription
 */

import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { isValidWebhookTopic } from "@/lib/webhook-topics";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  url: z
    .string()
    .url()
    .regex(/^https:\/\//, "url_must_be_https")
    .optional(),
  topics: z
    .array(z.string().min(1).max(64).refine(isValidWebhookTopic, { message: "unknown_topic" }))
    .min(1)
    .max(64)
    .optional(),
  description: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    if (Object.keys(parsed.data).length === 0) {
      return apiValidationError("no fields to update");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_webhooks")
      .update(parsed.data)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id")
      .maybeSingle();

    if (error) return apiInternalError(error, "integrations/webhooks PATCH");
    if (!data) return apiNotFound("webhook_not_found");

    return apiOk({ ok: true });
  } catch (e) {
    return apiInternalError(e, "integrations/webhooks PATCH");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error, count } = await admin
      .from("tenant_webhooks")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "integrations/webhooks DELETE");
    if (!count) return apiNotFound("webhook_not_found");

    return apiOk({ ok: true });
  } catch (e) {
    return apiInternalError(e, "integrations/webhooks DELETE");
  }
}
