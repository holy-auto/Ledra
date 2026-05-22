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
    .select("status, rate_limit_per_minute")
    .eq("id", keyRow.consumer_id)
    .maybeSingle();
  const consumer = consumerRaw as { status: string; rate_limit_per_minute: number } | null;
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
