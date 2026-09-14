/**
 * Enterprise SSO enforcement policy.
 *
 * When a tenant has `sso_required = true` and `sso_email_domain` set, any
 * user whose email belongs to that domain must authenticate via SAML SSO
 * (see `startSsoSignIn`). Password sign-in is blocked at the application
 * layer to give a clear UX hint ("your company requires SSO") rather than
 * Supabase Auth's generic "invalid credentials".
 *
 * This is intentionally a SOFT enforcement layer:
 *   - It runs BEFORE supabase.auth.signInWithPassword, so the password is
 *     never tested. Saves the round-trip and avoids leaking "user exists"
 *     timing data through differential latency.
 *   - It's app-layer only. A determined attacker calling supabase-js
 *     directly with the anon key would still hit the auth provider — but
 *     the corresponding session would still be valid for the user (because
 *     their account exists). The hard control lives in IdP-side policies
 *     (e.g. disable password auth on the IdP) and Supabase RBAC.
 *
 * Migration: 20260511000002_tenants_sso_required.sql
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SsoEnforcementOutcome =
  { allowed: true } | { allowed: false; reason: "sso_required"; tenantSsoDomain: string };

/** Extract the lowercased domain from an email, or null if malformed. */
export function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  // RFC-compliant-ish: alphanumeric / hyphen / dot, length 3..253, must
  // contain at least one dot. Mirrors the validation in startSsoSignIn.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
  return domain;
}

/**
 * Check whether password sign-in should be allowed for the given email.
 *
 * Returns `{ allowed: false }` only when a tenant exists with
 * sso_required=true AND sso_email_domain matching the email's domain.
 * In all other cases (no tenant match, sso_required=false, malformed
 * email) returns `{ allowed: true }` — fail open, the auth provider has
 * the final say.
 */
export async function checkPasswordSignInAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  email: string,
): Promise<SsoEnforcementOutcome> {
  const domain = emailDomain(email);
  if (!domain) return { allowed: true };

  const { data, error } = await admin
    .from("tenants")
    .select("sso_email_domain")
    .eq("sso_required", true)
    .eq("sso_email_domain", domain)
    .limit(1)
    .maybeSingle();

  // On query error, fail open. SSO enforcement is a UX hint; the real
  // gate is the IdP-side password policy. Blocking everyone on a transient
  // DB blip would lock out legitimate users.
  if (error) return { allowed: true };

  if (!data) return { allowed: true };

  return { allowed: false, reason: "sso_required", tenantSsoDomain: domain };
}
