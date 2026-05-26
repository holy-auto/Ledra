/**
 * GET   /api/admin/platform/passport-consumers/[id]
 *   Consumer detail: meta + keys (no raw secret) + 30-day call summary.
 *
 * PATCH /api/admin/platform/passport-consumers/[id]
 *   Update status / quotas / contact. The id, key set, and audit logs
 *   are immutable through this endpoint.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  contact_email: z.string().trim().email().max(200).optional(),
  status: z.enum(["active", "suspended", "closed"]).optional(),
  monthly_quota: z.coerce.number().int().min(0).max(10_000_000).optional(),
  rate_limit_per_minute: z.coerce.number().int().min(1).max(10_000).optional(),
});

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function shapeKey(k: KeyRow) {
  const now = Date.now();
  const expired = k.expires_at != null && new Date(k.expires_at).getTime() < now;
  const status = k.revoked_at ? "revoked" : expired ? "expired" : "active";
  return {
    id: k.id,
    name: k.name,
    key_prefix: k.key_prefix,
    scopes: k.scopes ?? [],
    last_used_at: k.last_used_at,
    expires_at: k.expires_at,
    revoked_at: k.revoked_at,
    created_at: k.created_at,
    status,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("passport-consumer detail — keys + 30d call summary");

    const { data: consumer, error: cErr } = await admin
      .from("passport_api_consumers")
      .select("id, name, contact_email, status, monthly_quota, rate_limit_per_minute, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (cErr) return apiInternalError(cErr, "passport-consumer GET");
    if (!consumer) return apiNotFound("consumer_not_found");

    const { data: keysRaw } = await admin
      .from("passport_api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
      .eq("consumer_id", id)
      .order("created_at", { ascending: false });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: logsRaw } = await admin
      .from("passport_api_call_logs")
      .select("endpoint, response_status, called_at")
      .eq("consumer_id", id)
      .gte("called_at", since)
      .order("called_at", { ascending: false })
      .limit(500);

    const logs = (logsRaw ?? []) as { endpoint: string; response_status: number; called_at: string }[];
    const callCount30d = logs.length;
    const errorCount30d = logs.filter((l) => l.response_status >= 400).length;

    const byEndpoint = new Map<string, number>();
    for (const l of logs) {
      byEndpoint.set(l.endpoint, (byEndpoint.get(l.endpoint) ?? 0) + 1);
    }
    const endpointBreakdown = Array.from(byEndpoint.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count);

    return apiJson({
      consumer,
      keys: ((keysRaw ?? []) as KeyRow[]).map(shapeKey),
      stats: {
        call_count_30d: callCount30d,
        error_count_30d: errorCount30d,
        endpoint_breakdown: endpointBreakdown,
        last_call_at: logs[0]?.called_at ?? null,
      },
    });
  } catch (e) {
    return apiInternalError(e, "passport-consumer GET");
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    if (Object.keys(parsed.data).length === 0) {
      return apiValidationError("no_fields_to_update");
    }

    const admin = createPlatformScopedAdmin("passport-consumer PATCH — status/quota/contact update");

    const { data, error } = await admin
      .from("passport_api_consumers")
      .update(parsed.data)
      .eq("id", id)
      .select("id, name, contact_email, status, monthly_quota, rate_limit_per_minute, created_at, updated_at")
      .maybeSingle();
    if (error) return apiInternalError(error, "passport-consumer PATCH");
    if (!data) return apiNotFound("consumer_not_found");

    return apiJson({ consumer: data });
  } catch (e) {
    return apiInternalError(e, "passport-consumer PATCH");
  }
}
