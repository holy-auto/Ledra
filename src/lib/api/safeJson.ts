/**
 * Safe `response.json()` wrapper.
 *
 * The previous project-wide idiom was:
 *
 *   const j = await res.json().catch(() => null);
 *
 * which silently swallows JSON parse errors, auth failures that arrive as
 * non-JSON 5xx pages, and transient network blips. Dashboards that look
 * "empty after a deploy" are almost always this pattern hiding a real
 * failure.
 *
 * This helper keeps the same ergonomic shape (await + fallback) but also:
 *   - Tags a structured error on the console/Sentry path so we can tell
 *     a malformed body apart from an intentional empty response.
 *   - Optionally skips parsing for 204/205 responses where there's no body.
 *
 * Migration note: the legacy `.catch((): null => null)` pattern is still
 * valid; adopt `safeJson` incrementally at callsites where a silent empty
 * state is actually user-visible.
 */

import { logger } from "@/lib/logger";

type SafeJsonOptions<T> = {
  /** Fallback to return when parsing fails. */
  fallback: T;
  /** Route/label for logging. Recommended. */
  context?: string;
  /**
   * Treat non-OK responses as parse failures even if the body was JSON?
   * Defaults to `false` — most callers want to parse error envelopes.
   */
  requireOk?: boolean;
};

/**
 * @example
 *   const j = await safeJson(res, { fallback: null, context: "admin.billing" });
 *   if (!j) return <EmptyState reason="fetch_failed" />;
 */
export async function safeJson<T>(res: Response, opts: SafeJsonOptions<T>): Promise<T> {
  const { fallback, context, requireOk = false } = opts;

  if (res.status === 204 || res.status === 205) return fallback;
  if (requireOk && !res.ok) {
    logger.warn("safeJson: non-OK response treated as failure", {
      context,
      status: res.status,
      url: res.url || undefined,
    });
    return fallback;
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    logger.warn("safeJson: response body was not valid JSON", {
      context,
      status: res.status,
      url: res.url || undefined,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}
