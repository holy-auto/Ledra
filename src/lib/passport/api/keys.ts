/**
 * Passport verification API — consumer key auth.
 *
 * Mirrors src/lib/tenant-api-keys.ts but uses a different prefix
 * (`lpk_live_` vs `lk_live_`) and table (passport_api_keys) so
 * consumer credentials are isolated from tenant credentials and
 * cannot be silently used in the wrong scope.
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER ?? "";

const PREFIX = "lpk_live_";

export interface PassportApiKeyContext {
  consumerId: string;
  keyId: string;
  scopes: string[];
  rateLimitPerMinute: number;
  monthlyQuota: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, any, any>;

export function generatePassportApiKey(): { rawKey: string; prefix: string; keyHash: string } {
  const random = crypto.randomBytes(32).toString("base64url");
  const rawKey = `${PREFIX}${random}`;
  const prefix = rawKey.slice(0, 12);
  const keyHash = hashPassportApiKey(rawKey);
  return { rawKey, prefix, keyHash };
}

export function hashPassportApiKey(rawKey: string): string {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return crypto.createHash("sha256").update(`passportapikey|v1|${rawKey}|${PEPPER}`).digest("hex");
}

export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function resolvePassportApiKey(
  admin: AdminDb,
  rawKey: string,
): Promise<{ ok: true; ctx: PassportApiKeyContext } | { ok: false; error: string }> {
  if (!rawKey || !rawKey.startsWith(PREFIX)) return { ok: false, error: "invalid_key_format" };

  let keyHash: string;
  try {
    keyHash = hashPassportApiKey(rawKey);
  } catch {
    return { ok: false, error: "auth_pepper_missing" };
  }

  const { data: keyRowRaw, error: keyErr } = await admin
    .from("passport_api_keys")
    .select("id, consumer_id, scopes, expires_at, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyErr) {
    logger.warn("passport_api_keys lookup failed", { error: keyErr.message });
    return { ok: false, error: "lookup_failed" };
  }
  if (!keyRowRaw) return { ok: false, error: "unknown_key" };

  const keyRow = keyRowRaw as {
    id: string;
    consumer_id: string;
    scopes: string[] | null;
    expires_at: string | null;
    revoked_at: string | null;
  };
  if (keyRow.revoked_at) return { ok: false, error: "revoked" };
  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }

  // Resolve the consumer status + rate-limit config.
  const { data: consumerRaw } = await admin
    .from("passport_api_consumers")
    .select("status, rate_limit_per_minute, monthly_quota")
    .eq("id", keyRow.consumer_id)
    .maybeSingle();
  const consumer = consumerRaw as {
    status: string;
    rate_limit_per_minute: number;
    monthly_quota: number;
  } | null;
  if (!consumer) return { ok: false, error: "consumer_missing" };
  if (consumer.status !== "active") return { ok: false, error: "consumer_inactive" };

  // Best-effort last_used_at touch.
  admin
    .from("passport_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(({ error: upErr }) => {
      if (upErr) logger.debug("passport_api_keys last_used_at update failed", { error: upErr.message });
    });

  return {
    ok: true,
    ctx: {
      consumerId: keyRow.consumer_id,
      keyId: keyRow.id,
      scopes: keyRow.scopes ?? [],
      rateLimitPerMinute: consumer.rate_limit_per_minute,
      monthlyQuota: consumer.monthly_quota,
    },
  };
}

export function hasPassportScope(ctx: PassportApiKeyContext, ...required: string[]): boolean {
  if (ctx.scopes.includes("*")) return true;
  return required.some((s) => ctx.scopes.includes(s));
}

/**
 * Best-effort: record a call to the verification API for billing
 * reconciliation + abuse triage. Hashes the caller IP so we
 * don't store raw addresses.
 */
export async function logPassportApiCall(args: {
  admin: AdminDb;
  apiKeyId: string | null;
  consumerId: string | null;
  endpoint: string;
  vinQueried: string | null;
  responseStatus: number;
  responseTimeMs: number;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const ipHash = args.ip ? crypto.createHash("sha256").update(args.ip).digest("hex").slice(0, 32) : null;

  try {
    await args.admin.from("passport_api_call_logs").insert({
      api_key_id: args.apiKeyId,
      consumer_id: args.consumerId,
      endpoint: args.endpoint,
      vin_queried_normalized: args.vinQueried,
      response_status: args.responseStatus,
      response_time_ms: args.responseTimeMs,
      ip_hash: ipHash,
      user_agent: args.userAgent,
    });
  } catch (e) {
    logger.warn("logPassportApiCall failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

export type MonthlyQuotaCheck = { allowed: boolean; used: number; limit: number };

/**
 * Hard-enforce the consumer's monthly_quota.
 *
 * Counts `passport_api_call_logs` rows with called_at >= start-of-current-
 * UTC-month for the consumer. A quota of 0 means "unlimited" (operators
 * can disable enforcement per-consumer without churning code).
 *
 * Called at the top of each `/api/v1/passport/*` endpoint, after auth +
 * scope checks but before any expensive work. If the call would put the
 * consumer over the limit, the endpoint returns 429 plan_limit.
 *
 * Cost: one COUNT(*) per request, served by the index
 *   passport_api_call_logs (consumer_id, called_at DESC)
 * which is well-bounded since we only ever scan the current month.
 */
export async function checkPassportMonthlyQuota(
  admin: AdminDb,
  consumerId: string,
  monthlyQuota: number,
): Promise<MonthlyQuotaCheck> {
  if (!Number.isFinite(monthlyQuota) || monthlyQuota <= 0) {
    return { allowed: true, used: 0, limit: monthlyQuota };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { count, error } = await admin
    .from("passport_api_call_logs")
    .select("id", { count: "exact", head: true })
    .eq("consumer_id", consumerId)
    .gte("called_at", monthStart.toISOString());

  if (error) {
    // Fail open on counter-DB error: better to serve a few extra calls
    // than to lock out a paying consumer because Postgres hiccuped.
    logger.warn("passport quota lookup failed", { consumerId, error: error.message });
    return { allowed: true, used: 0, limit: monthlyQuota };
  }

  const used = count ?? 0;
  return { allowed: used < monthlyQuota, used, limit: monthlyQuota };
}
