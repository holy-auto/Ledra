/**
 * GET  /api/admin/integrations/webhooks   — list this tenant's webhooks
 * POST /api/admin/integrations/webhooks   — create a new subscription
 *
 * 顧客が自社システム宛に Ledra の event (certificate.issued etc.) を
 * webhook で受け取るための購読管理。生 secret は POST のレスポンスで一度だけ
 * 返却され、以降はマスクされる。
 */

import { z } from "zod";
import crypto from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { isValidWebhookTopic } from "@/lib/webhook-topics";
import { checkOutboundWebhookUrl } from "@/lib/security/urlAllowlist";

export const dynamic = "force-dynamic";

interface TenantWebhookRow {
  id: string;
  url: string;
  topics: string[];
  secret: string;
  description: string | null;
  is_active: boolean;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  last_delivery_error: string | null;
  created_at: string;
}

const createSchema = z.object({
  url: z
    .string()
    .url()
    // SSRF guard: https 以外 / IP リテラル / localhost 系 / 埋め込み credentials を拒否
    .superRefine((u, ctx) => {
      const res = checkOutboundWebhookUrl(u);
      if (!res.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `url_${res.reason}` });
    }),
  topics: z
    .array(z.string().min(1).max(64).refine(isValidWebhookTopic, { message: "unknown_topic" }))
    .min(1)
    .max(64)
    .default(["*"]),
  description: z.string().max(200).optional(),
});

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function shapeRow(row: TenantWebhookRow, includeSecret = false) {
  return {
    id: row.id,
    url: row.url,
    topics: row.topics,
    description: row.description,
    is_active: row.is_active,
    secret: includeSecret ? row.secret : maskSecret(row.secret),
    last_delivery_at: row.last_delivery_at,
    last_delivery_status: row.last_delivery_status,
    last_delivery_error: row.last_delivery_error,
    created_at: row.created_at,
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:view")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_webhooks")
      .select(
        "id, url, topics, secret, description, is_active, last_delivery_at, last_delivery_status, last_delivery_error, created_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (error) return apiInternalError(error, "integrations/webhooks GET");

    return apiOk({ webhooks: ((data ?? []) as TenantWebhookRow[]).map((r) => shapeRow(r)) });
  } catch (e) {
    return apiInternalError(e, "integrations/webhooks GET");
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const secret = `whsec_${crypto.randomBytes(32).toString("base64url")}`;
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_webhooks")
      .insert({
        tenant_id: caller.tenantId,
        url: parsed.data.url,
        topics: parsed.data.topics,
        secret,
        description: parsed.data.description ?? null,
      })
      .select(
        "id, url, topics, secret, description, is_active, last_delivery_at, last_delivery_status, last_delivery_error, created_at",
      )
      .single();

    if (error) return apiInternalError(error, "integrations/webhooks POST");

    // Plain secret only returned on creation.
    return apiOk({ webhook: shapeRow(data as TenantWebhookRow, true) });
  } catch (e) {
    return apiInternalError(e, "integrations/webhooks POST");
  }
}
