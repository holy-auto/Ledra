/**
 * LinkedIn OAuth token storage + auto-refresh for the daily auto-poster.
 *
 * LinkedIn access tokens expire after ~60 days; refresh tokens last ~365 days
 * (refresh tokens are only issued to apps approved for programmatic refresh).
 * This module keeps a single encrypted token row in
 * `marketing_linkedin_credentials` and refreshes the access token before it
 * expires, mirroring the Square/accounting refresh pattern.
 *
 * Bootstrap: on first run the row is seeded from env vars
 * (LINKEDIN_ACCESS_TOKEN / LINKEDIN_REFRESH_TOKEN). After that, the DB row is
 * the source of truth and env values are only a fallback.
 *
 * Env:
 *   LINKEDIN_AUTOPOST_ENABLED   "true" to allow real posting
 *   LINKEDIN_ACCESS_TOKEN       initial access token (bootstrap)
 *   LINKEDIN_REFRESH_TOKEN      initial refresh token (bootstrap, optional)
 *   LINKEDIN_CLIENT_ID          OAuth app client id (required for refresh)
 *   LINKEDIN_CLIENT_SECRET      OAuth app client secret (required for refresh)
 *   LINKEDIN_AUTHOR_URN         author URN (fallback if not stored in DB)
 *   LINKEDIN_API_VERSION        REST API version "YYYYMM" (optional)
 */

import { buildSecretWrite, readSecret } from "@/lib/crypto/tenantSecrets";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { DEFAULT_LINKEDIN_API_VERSION, type LinkedInCredentials } from "@/lib/marketing/linkedin";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";
const CREDENTIALS_ID = "default";
const SECRET_LABEL = "marketing_linkedin_credentials";

/** Refresh the access token when fewer than this many ms remain. */
const REFRESH_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
/** Heuristic expiry for a manually-pasted access token with no refresh path. */
const STATIC_TOKEN_TTL_MS = 50 * 24 * 60 * 60 * 1000; // 50 days

export type ResolveResult = { ok: true; credentials: LinkedInCredentials } | { ok: false; reason: string };

interface CredentialsRow {
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  author_urn: string | null;
}

function apiVersion(): string {
  return process.env.LINKEDIN_API_VERSION?.trim() || DEFAULT_LINKEDIN_API_VERSION;
}

function refreshClientCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function readRow(admin: Admin): Promise<CredentialsRow | null> {
  const { data, error } = await admin
    .from("marketing_linkedin_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext, token_expires_at, author_urn")
    .eq("id", CREDENTIALS_ID)
    .maybeSingle();
  if (error) throw new Error(`failed to read linkedin credentials: ${error.message}`);
  return (data as CredentialsRow | null) ?? null;
}

/** Seed the singleton row from env on first run. Returns the seeded row. */
async function seedFromEnv(admin: Admin): Promise<CredentialsRow | null> {
  const envAccess = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const envRefresh = process.env.LINKEDIN_REFRESH_TOKEN?.trim();
  const envAuthor = process.env.LINKEDIN_AUTHOR_URN?.trim() || null;
  if (!envAccess && !envRefresh) return null;

  const canRefresh = Boolean(envRefresh && refreshClientCreds());
  // If we can refresh, force an immediate refresh by marking the seeded token
  // as already expired; otherwise assume a conservative TTL for the static one.
  const tokenExpiresAt = canRefresh
    ? new Date(0).toISOString()
    : new Date(Date.now() + STATIC_TOKEN_TTL_MS).toISOString();

  const accessPayload = envAccess ? await buildSecretWrite(envAccess) : { ciphertext: null };
  const refreshPayload = envRefresh ? await buildSecretWrite(envRefresh) : { ciphertext: null };

  const row = {
    id: CREDENTIALS_ID,
    access_token_ciphertext: accessPayload.ciphertext,
    refresh_token_ciphertext: refreshPayload.ciphertext,
    token_expires_at: tokenExpiresAt,
    author_urn: envAuthor,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("marketing_linkedin_credentials").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`failed to seed linkedin credentials: ${error.message}`);

  return {
    access_token_ciphertext: row.access_token_ciphertext,
    refresh_token_ciphertext: row.refresh_token_ciphertext,
    token_expires_at: row.token_expires_at,
    author_urn: row.author_urn,
  };
}

/**
 * Exchange the refresh token for a fresh access token and persist it.
 * Returns the new access token, or null on failure.
 */
async function refreshAccessToken(admin: Admin, refreshToken: string): Promise<string | null> {
  const creds = refreshClientCreds();
  if (!creds) return null;

  let data: { access_token?: string; expires_in?: number; refresh_token?: string };
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("[linkedin] token refresh failed:", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    data = await res.json();
  } catch (e) {
    console.error("[linkedin] token refresh error:", e instanceof Error ? e.message : String(e));
    return null;
  }

  if (!data.access_token || !data.expires_in) return null;
  const newRefresh = data.refresh_token ?? refreshToken;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  const accessPayload = await buildSecretWrite(data.access_token);
  const refreshPayload = await buildSecretWrite(newRefresh);
  const { error } = await admin
    .from("marketing_linkedin_credentials")
    .update({
      access_token_ciphertext: accessPayload.ciphertext,
      refresh_token_ciphertext: refreshPayload.ciphertext,
      token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", CREDENTIALS_ID);
  if (error) {
    console.error("[linkedin] failed to persist refreshed token:", error.message);
    // The refresh succeeded at LinkedIn; return the token so this run can post.
  }
  return data.access_token;
}

/**
 * Resolve a valid LinkedIn access token + author URN, refreshing first if the
 * stored token is near expiry. Returns a skip reason instead of throwing when
 * the feature is disabled or not yet configured.
 */
export async function resolveLinkedInCredentials(admin: Admin): Promise<ResolveResult> {
  if (process.env.LINKEDIN_AUTOPOST_ENABLED !== "true") {
    return { ok: false, reason: "disabled" };
  }

  let row = await readRow(admin);
  if (!row) {
    row = await seedFromEnv(admin);
    if (!row) return { ok: false, reason: "not-configured" };
  }

  const authorUrn = row.author_urn?.trim() || process.env.LINKEDIN_AUTHOR_URN?.trim();
  if (!authorUrn) return { ok: false, reason: "not-configured" };

  const refreshToken = await readSecret(row.refresh_token_ciphertext, `${SECRET_LABEL}.refresh_token`);
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
  const expiringSoon = !expiresAt || expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;
  const canRefresh = Boolean(refreshToken && refreshClientCreds());

  if (expiringSoon && canRefresh && refreshToken) {
    const refreshed = await refreshAccessToken(admin, refreshToken);
    if (refreshed) {
      return { ok: true, credentials: { accessToken: refreshed, authorUrn, apiVersion: apiVersion() } };
    }
    // Refresh failed — fall through and try the stored token if still usable.
  }

  const accessToken = await readSecret(row.access_token_ciphertext, `${SECRET_LABEL}.access_token`);
  if (!accessToken) {
    return { ok: false, reason: canRefresh ? "refresh-failed" : "not-configured" };
  }
  if (expiresAt && expiresAt.getTime() <= Date.now() && !canRefresh) {
    return { ok: false, reason: "token-expired-needs-reauth" };
  }

  return { ok: true, credentials: { accessToken, authorUrn, apiVersion: apiVersion() } };
}
