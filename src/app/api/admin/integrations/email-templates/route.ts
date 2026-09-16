/**
 * GET  /api/admin/integrations/email-templates
 *      → list this tenant's overrides + the built-in defaults
 *      that haven't been overridden.
 *
 * POST /api/admin/integrations/email-templates
 *      → upsert (tenant_id, topic, is_active=true) — the unique
 *      partial index in migration 20260503000002 enforces 1 active
 *      template per (tenant, topic).
 */

import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";
import { listBuiltinTopics } from "@/lib/email/templates";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

interface TemplateRow {
  id: string;
  topic: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const upsertSchema = z.object({
  topic: z.string().min(1).max(64),
  subject: z.string().min(1).max(200),
  body_html: z.string().min(1).max(50_000),
  body_text: z.string().max(50_000).nullable().optional(),
});

export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("tenant_email_templates")
        .select("id, topic, subject, body_html, body_text, is_active, created_at, updated_at")
        .eq("tenant_id", caller.tenantId)
        .eq("is_active", true)
        .order("topic", { ascending: true });

      if (error) return apiInternalError(error, "integrations/email-templates GET");

      const overrides = (data ?? []) as TemplateRow[];
      const overridden = new Set(overrides.map((r) => r.topic));
      const available = listBuiltinTopics();

      return apiOk({
        overrides,
        available_topics: available,
        missing: available.filter((t) => !overridden.has(t)),
      });
    } catch (e) {
      return apiInternalError(e, "integrations/email-templates GET");
    }
  },
  { permission: "settings:view", routeName: "integrations/email-templates GET" },
);

export const POST = withCaller(
  async (req, { caller }) => {
    try {
      const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // Deactivate any existing active row for this topic (the partial unique
      // index enforces only one active per topic — soft-deactivating preserves
      // history for audit).
      await admin
        .from("tenant_email_templates")
        .update({ is_active: false })
        .eq("tenant_id", caller.tenantId)
        .eq("topic", parsed.data.topic)
        .eq("is_active", true);

      const { data, error } = await admin
        .from("tenant_email_templates")
        .insert({
          tenant_id: caller.tenantId,
          topic: parsed.data.topic,
          subject: parsed.data.subject,
          body_html: parsed.data.body_html,
          body_text: parsed.data.body_text ?? null,
          is_active: true,
        })
        .select("id, topic, subject, body_html, body_text, is_active, created_at, updated_at")
        .single();

      if (error) return apiInternalError(error, "integrations/email-templates POST");
      return apiOk({ template: data as TemplateRow });
    } catch (e) {
      return apiInternalError(e, "integrations/email-templates POST");
    }
  },
  { permission: "settings:edit", routeName: "integrations/email-templates POST" },
);
