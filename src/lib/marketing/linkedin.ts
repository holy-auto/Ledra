/**
 * Minimal LinkedIn REST "Posts" API client for publishing text posts.
 *
 * Uses the versioned REST API (https://api.linkedin.com/rest/posts). The
 * author can be an organization (`urn:li:organization:{id}`) or a member
 * (`urn:li:person:{id}`) and is taken verbatim from LINKEDIN_AUTHOR_URN.
 *
 * Required env (all optional until the feature is configured):
 *   LINKEDIN_ACCESS_TOKEN  OAuth2 access token with w_organization_social
 *                          (org page) or w_member_social (personal) scope.
 *   LINKEDIN_AUTHOR_URN    e.g. "urn:li:organization:12345678"
 *   LINKEDIN_API_VERSION   optional, "YYYYMM" (defaults to a known-good value)
 *   LINKEDIN_AUTOPOST_ENABLED  "true" to allow real posting; otherwise the
 *                          client reports "disabled" and posts nothing.
 *
 * When any required value is missing (or the flag is off) the client returns
 * a structured `{ ok: false, skipped: ... }` result instead of throwing, so
 * the cron pipeline stays green before LinkedIn is wired up.
 */

const LINKEDIN_POSTS_ENDPOINT = "https://api.linkedin.com/rest/posts";
const DEFAULT_API_VERSION = "202405";
const REQUEST_TIMEOUT_MS = 15_000;

export type LinkedInPostResult =
  | { ok: true; urn: string }
  | { ok: false; skipped: "disabled" | "not-configured" }
  | { ok: false; error: string; status?: number };

export interface LinkedInConfig {
  accessToken: string;
  authorUrn: string;
  apiVersion: string;
}

/**
 * Read + validate LinkedIn config from the environment. Returns null when the
 * feature is disabled or credentials are incomplete (caller should skip).
 */
export function getLinkedInConfig():
  | { ok: true; config: LinkedInConfig }
  | { ok: false; reason: "disabled" | "not-configured" } {
  if (process.env.LINKEDIN_AUTOPOST_ENABLED !== "true") {
    return { ok: false, reason: "disabled" };
  }
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN?.trim();
  if (!accessToken || !authorUrn) {
    return { ok: false, reason: "not-configured" };
  }
  const apiVersion = process.env.LINKEDIN_API_VERSION?.trim() || DEFAULT_API_VERSION;
  return { ok: true, config: { accessToken, authorUrn, apiVersion } };
}

/**
 * Publish a single text post to LinkedIn. Returns a structured result and
 * never throws for expected failures (HTTP errors, timeouts, missing config).
 */
export async function postToLinkedIn(text: string): Promise<LinkedInPostResult> {
  const cfg = getLinkedInConfig();
  if (!cfg.ok) {
    return { ok: false, skipped: cfg.reason };
  }
  const { accessToken, authorUrn, apiVersion } = cfg.config;

  try {
    const res = await fetch(LINKEDIN_POSTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": apiVersion,
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: text,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: `LinkedIn API ${res.status}: ${detail.slice(0, 500)}`,
      };
    }

    // The created post URN is returned in the `x-restli-id` header (or `x-linkedin-id`).
    const urn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
    return { ok: true, urn };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `LinkedIn request failed: ${message}` };
  }
}
