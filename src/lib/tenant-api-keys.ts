/**
 * Tenant API key auth.
 *
 * 認証フロー:
 *   1. 顧客側システムが `Authorization: Bearer lk_live_XXXX...` で叩く
 *   2. resolveTenantApiKey() がリクエストを検証 → CallerInfo 相当を返す
 *
 * セキュリティ:
 *   - 生鍵は SHA-256(key + pepper) で照合。DB には hash のみ保存。
 *   - last_used_at を best-effort で更新 (失敗しても authentication は成功)
 *   - 失効した鍵は revoked_at != null で除外
 *   - スコープ enforcement は別途 enforceScope() を route 側で呼ぶ
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER ?? "";

export interface TenantApiKeyContext {
  tenantId: string;
  keyId: string;
  scopes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, any, any>;

/**
 * Generate a brand new API key. Returns both the displayable
 * row (for the UI / DB) and the raw key (shown to user once).
 */
export function generateApiKey(): { rawKey: string; prefix: string; keyHash: string } {
  // 32 bytes of entropy → base32-ish (URL-safe). Stripe-style readable prefix.
  const random = crypto.randomBytes(32).toString("base64url");
  const rawKey = `lk_live_${random}`;
  const prefix = rawKey.slice(0, 12);
  const keyHash = hashKey(rawKey);
  return { rawKey, prefix, keyHash };
}

export function hashKey(rawKey: string): string {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return crypto.createHash("sha256").update(`apikey|v1|${rawKey}|${PEPPER}`).digest("hex");
}

/** Pull the bearer token out of an Authorization header. */
export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Verify a presented API key. Returns the tenant context on success.
 *
 * @param admin   service-role Supabase client (RLS bypassed — required because
 *                we don't have a tenant scope yet at this point).
 * @param rawKey  raw `lk_live_...` token from Authorization header.
 */
export async function resolveTenantApiKey(
  admin: AdminDb,
  rawKey: string,
): Promise<{ ok: true; ctx: TenantApiKeyContext } | { ok: false; error: string }> {
  if (!rawKey || !rawKey.startsWith("lk_live_")) return { ok: false, error: "invalid_key_format" };

  let keyHash: string;
  try {
    keyHash = hashKey(rawKey);
  } catch {
    return { ok: false, error: "auth_pepper_missing" };
  }

  const { data, error } = await admin
    .from("tenant_api_keys")
    .select("id, tenant_id, scopes, expires_at, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) {
    logger.warn("tenant_api_keys lookup failed", { error: error.message });
    return { ok: false, error: "lookup_failed" };
  }
  if (!data) return { ok: false, error: "unknown_key" };
  if (data.revoked_at) return { ok: false, error: "revoked" };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }

  // Best-effort: update last_used_at without blocking auth.
  admin
    .from("tenant_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error: upErr }) => {
      if (upErr) logger.debug("tenant_api_keys last_used_at update failed", { error: upErr.message });
    });

  return {
    ok: true,
    ctx: {
      tenantId: data.tenant_id as string,
      keyId: data.id as string,
      scopes: (data.scopes as string[]) ?? [],
    },
  };
}

/** Enforce that a key has at least one of the required scopes (OR semantics). */
export function hasAnyScope(ctx: TenantApiKeyContext, ...required: string[]): boolean {
  if (ctx.scopes.includes("*")) return true;
  return required.some((s) => ctx.scopes.includes(s));
}
