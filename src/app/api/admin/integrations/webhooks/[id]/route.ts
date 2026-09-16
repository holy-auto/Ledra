/**
 * PATCH  /api/admin/integrations/webhooks/[id] — toggle active / change topics / url
 * DELETE /api/admin/integrations/webhooks/[id] — remove subscription
 */

import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiOk,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { isValidWebhookTopic } from "@/lib/webhook-topics";
import { checkOutboundWebhookUrl } from "@/lib/security/urlAllowlist";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  url: z
    .string()
    .url()
    // SSRF guard: https 以外 / IP リテラル / localhost 系 / 埋め込み credentials を拒否
    .superRefine((u, ctx) => {
      const res = checkOutboundWebhookUrl(u);
      if (!res.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `url_${res.reason}` });
    })
    .optional(),
  topics: z
    .array(z.string().min(1).max(64).refine(isValidWebhookTopic, { message: "unknown_topic" }))
    .min(1)
    .max(64)
    .optional(),
  description: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const PATCH = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const { id } = params;

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
  },
  { permission: "settings:edit", routeName: "integrations/webhooks PATCH" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const { id } = params;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error, count } = await admin
      .from("tenant_webhooks")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "integrations/webhooks DELETE");
    if (!count) return apiNotFound("webhook_not_found");

    return apiOk({ ok: true });
  },
  { permission: "settings:edit", routeName: "integrations/webhooks DELETE" },
);
