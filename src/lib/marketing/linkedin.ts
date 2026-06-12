/**
 * Minimal LinkedIn REST "Posts" API client for publishing text posts.
 *
 * Uses the versioned REST API (https://api.linkedin.com/rest/posts). The
 * author can be an organization (`urn:li:organization:{id}`) or a member
 * (`urn:li:person:{id}`) and is supplied by the caller.
 *
 * This module is intentionally pure: it does not read env or the database.
 * Credentials (including refresh) are resolved by `linkedinTokens.ts` and
 * passed in, which keeps the HTTP client testable and storage-agnostic.
 */

const LINKEDIN_POSTS_ENDPOINT = "https://api.linkedin.com/rest/posts";
export const DEFAULT_LINKEDIN_API_VERSION = "202405";
const REQUEST_TIMEOUT_MS = 15_000;

export interface LinkedInCredentials {
  accessToken: string;
  /** e.g. "urn:li:organization:12345678" or "urn:li:person:xxxx" */
  authorUrn: string;
  /** REST API version "YYYYMM" */
  apiVersion: string;
}

export type LinkedInPostResult = { ok: true; urn: string } | { ok: false; error: string; status?: number };

/**
 * Publish a single text post to LinkedIn. Returns a structured result and
 * never throws for expected failures (HTTP errors, timeouts).
 */
export async function postToLinkedIn(text: string, credentials: LinkedInCredentials): Promise<LinkedInPostResult> {
  const { accessToken, authorUrn, apiVersion } = credentials;

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
