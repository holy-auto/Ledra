/**
 * GET  /api/admin/platform/passport-consumers
 *   Platform-admin only. List all passport API consumers with key counts and
 *   30-day call counts for at-a-glance billing reconciliation.
 *
 * POST /api/admin/platform/passport-consumers
 *   Create a new consumer. Does NOT issue an API key (use POST .../[id]/keys
 *   afterwards so the raw key shows in a single, dedicated UI step).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contact_email: z.string().trim().email().max(200),
  monthly_quota: z.coerce.number().int().min(0).max(10_000_000).optional(),
  rate_limit_per_minute: z.coerce.number().int().min(1).max(10_000).optional(),
});

type ConsumerRow = {
  id: string;
  name: string;
  contact_email: string;
  status: string;
  monthly_quota: number;
  rate_limit_per_minute: number;
  stripe_subscription_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("passport-consumers list — platform-wide API consumer overview");

    const { data: consumersRaw, error } = await admin
      .from("passport_api_consumers")
      .select(
        "id, name, contact_email, status, monthly_quota, rate_limit_per_minute, " +
          "stripe_subscription_item_id, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) return apiInternalError(error, "passport-consumers GET");

    const consumers = (consumersRaw ?? []) as unknown as ConsumerRow[];
    if (consumers.length === 0) {
      return apiJson({ consumers: [] });
    }

    const consumerIds = consumers.map((c) => c.id);

    // Active key counts per consumer (revoked_at IS NULL and not expired).
    const { data: keysRaw } = await admin
      .from("passport_api_keys")
      .select("consumer_id, expires_at, revoked_at, last_used_at")
      .in("consumer_id", consumerIds);

    const now = Date.now();
    const activeKeyCount = new Map<string, number>();
    const lastUsedAt = new Map<string, string | null>();
    for (const k of (keysRaw ?? []) as {
      consumer_id: string;
      expires_at: string | null;
      revoked_at: string | null;
      last_used_at: string | null;
    }[]) {
      const isActive = !k.revoked_at && (!k.expires_at || new Date(k.expires_at).getTime() > now);
      if (isActive) activeKeyCount.set(k.consumer_id, (activeKeyCount.get(k.consumer_id) ?? 0) + 1);

      if (k.last_used_at) {
        const prev = lastUsedAt.get(k.consumer_id) ?? null;
        if (!prev || new Date(k.last_used_at).getTime() > new Date(prev).getTime()) {
          lastUsedAt.set(k.consumer_id, k.last_used_at);
        }
      }
    }

    // 30-day call counts per consumer. Fetch only the consumer_id column
    // since we're aggregating client-side — keeps the query simple and
    // doesn't require a Postgres RPC.
    const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: logsRaw } = await admin
      .from("passport_api_call_logs")
      .select("consumer_id")
      .in("consumer_id", consumerIds)
      .gte("called_at", since);

    const callCount30d = new Map<string, number>();
    for (const row of (logsRaw ?? []) as { consumer_id: string | null }[]) {
      if (!row.consumer_id) continue;
      callCount30d.set(row.consumer_id, (callCount30d.get(row.consumer_id) ?? 0) + 1);
    }

    return apiJson({
      consumers: consumers.map((c) => ({
        ...c,
        active_key_count: activeKeyCount.get(c.id) ?? 0,
        call_count_30d: callCount30d.get(c.id) ?? 0,
        last_used_at: lastUsedAt.get(c.id) ?? null,
      })),
    });
  } catch (e) {
    return apiInternalError(e, "passport-consumers GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const admin = createPlatformScopedAdmin("passport-consumers create — new external API consumer");

    const insert: Record<string, unknown> = {
      name: parsed.data.name,
      contact_email: parsed.data.contact_email,
    };
    if (parsed.data.monthly_quota !== undefined) insert.monthly_quota = parsed.data.monthly_quota;
    if (parsed.data.rate_limit_per_minute !== undefined) {
      insert.rate_limit_per_minute = parsed.data.rate_limit_per_minute;
    }

    const { data, error } = await admin
      .from("passport_api_consumers")
      .insert(insert)
      .select("id, name, contact_email, status, monthly_quota, rate_limit_per_minute, created_at, updated_at")
      .single();
    if (error) return apiInternalError(error, "passport-consumers POST");

    return apiJson({ consumer: data });
  } catch (e) {
    return apiInternalError(e, "passport-consumers POST");
  }
}
