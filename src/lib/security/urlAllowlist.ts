/**
 * Server-side URL allowlist for outbound asset fetches (SSRF guard).
 *
 * Any time the server fetches a *user-influenced* URL — downloading an image
 * for EXIF/tampering analysis, or handing an image URL to the Anthropic Vision
 * API — the URL MUST be validated here first. Without this, an authenticated
 * caller can point the URL at internal addresses (cloud metadata at
 * 169.254.169.254, http://localhost:<port>, private RFC1918 ranges) and turn
 * the server into a proxy for internal reconnaissance (SSRF).
 *
 * Design: **strict host allowlist + https-only**. We intentionally do NOT try
 * to "sanitize" arbitrary URLs; we only permit hosts we already serve assets
 * from. This mirrors the Next.js image `remotePatterns` policy
 * (`**.supabase.co` / `**.supabase.in`) in `next.config.ts`.
 *
 * Allowed:
 *   - scheme `https:` only
 *   - the project host parsed from `NEXT_PUBLIC_SUPABASE_URL` (the app's own
 *     Supabase Storage host) — and ONLY that host, not all `*.supabase.co`
 *   - any host listed in `SSRF_ALLOWED_IMAGE_HOSTS` (comma-separated; a leading
 *     dot makes it a subdomain-suffix match, otherwise it is host-or-subdomain)
 *
 * Rejected: http/file/data/etc., IP literals (v4/v6), `localhost`, embedded
 * credentials (`user:pass@`), non-443 ports, and any host outside the allowlist
 * — crucially including *other* projects on `*.supabase.co` (e.g. an
 * attacker-controlled Supabase Edge Function), which a broad suffix would let
 * through.
 *
 * Redirects: this module only validates the *initial* URL. Callers that fetch
 * server-side MUST also disable redirect following (`redirect: "error"`/
 * `"manual"`), otherwise an allowed host could 302 to an internal address after
 * the check has passed. The Anthropic Vision path cannot control Anthropic's
 * fetch, so the host allowlist (own project only) is the mitigation there.
 *
 * Residual risk: a fully strict guard against DNS rebinding would resolve the
 * host and re-check the resolved IP. Because the allowlist is restricted to the
 * app's own Supabase domain (not attacker-controlled hostnames), the rebinding
 * surface is minimal; revisit if arbitrary third-party hosts are ever
 * allowlisted.
 */

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Reason codes are stable strings so callers/tests can assert on them. */
export type UrlRejectReason =
  | "invalid_url"
  | "scheme_not_allowed"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "empty_host"
  | "ip_literal_not_allowed"
  | "localhost_not_allowed"
  | "host_not_allowlisted";

export type UrlCheckResult = { ok: true; url: URL } | { ok: false; reason: UrlRejectReason };

/** Thrown by {@link assertImageFetchUrl} when a URL fails validation. */
export class SsrfBlockedError extends Error {
  readonly reason: UrlRejectReason;
  constructor(reason: UrlRejectReason, raw: string) {
    super(`SSRF guard blocked URL (${reason}): ${raw}`);
    this.name = "SsrfBlockedError";
    this.reason = reason;
  }
}

/**
 * Build the set of allowed host suffixes. Recomputed per call so that env
 * changes (e.g. in tests) take effect without a process restart.
 */
function allowedHostSuffixes(): string[] {
  const suffixes: string[] = [];

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supaUrl) {
    try {
      const host = new URL(supaUrl).hostname.toLowerCase();
      if (host) suffixes.push(host);
    } catch {
      // ignore malformed env
    }
  }

  const extra = process.env.SSRF_ALLOWED_IMAGE_HOSTS;
  if (extra) {
    for (const part of extra.split(",")) {
      const s = part.trim().toLowerCase();
      if (s) suffixes.push(s);
    }
  }
  return suffixes;
}

/** True if `host` equals an allowlist entry or is a subdomain of it. */
function hostMatchesSuffix(host: string, entry: string): boolean {
  // Normalize a leading dot so ".supabase.co" and "supabase.co" behave the same.
  const base = entry.startsWith(".") ? entry.slice(1) : entry;
  if (!base) return false;
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Validate a single outbound-fetch URL against the allowlist.
 * Returns a discriminated result; never throws.
 */
export function checkImageFetchUrl(raw: string): UrlCheckResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "scheme_not_allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials_not_allowed" };
  if (url.port && url.port !== "443") return { ok: false, reason: "port_not_allowed" };

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "empty_host" };

  // Block IP literals outright — legitimate assets are always domain-based.
  // IPv6 hosts are bracketed by URL ("[::1]") so `:` / "[" catch them.
  if (IPV4_RE.test(host) || host.includes(":") || host.startsWith("[")) {
    return { ok: false, reason: "ip_literal_not_allowed" };
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost_not_allowed" };
  }

  const allowed = allowedHostSuffixes().some((s) => hostMatchesSuffix(host, s));
  if (!allowed) return { ok: false, reason: "host_not_allowlisted" };

  return { ok: true, url };
}

/** Validate and return the parsed URL, throwing {@link SsrfBlockedError} on failure. */
export function assertImageFetchUrl(raw: string): URL {
  const res = checkImageFetchUrl(raw);
  if (!res.ok) throw new SsrfBlockedError(res.reason, raw);
  return res.url;
}

/**
 * Partition a list of URLs into allowed/blocked. Convenient for routes that
 * receive an array of `photo_urls` and want to fail closed on any bad entry
 * or simply drop blocked ones.
 */
export function partitionImageFetchUrls(urls: string[]): {
  allowed: string[];
  blocked: Array<{ url: string; reason: UrlRejectReason }>;
} {
  const allowed: string[] = [];
  const blocked: Array<{ url: string; reason: UrlRejectReason }> = [];
  for (const u of urls) {
    const res = checkImageFetchUrl(u);
    if (res.ok) allowed.push(u);
    else blocked.push({ url: u, reason: res.reason });
  }
  return { allowed, blocked };
}
