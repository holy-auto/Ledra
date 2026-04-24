/**
 * Safe JSON response helpers.
 *
 * Motivation:
 * The idiom `await res.json().catch((): null => null)` hides every parse
 * failure behind a silent `null`. When a route returns an HTML error page
 * (eg. Vercel 502, misconfigured rewrite, CSP-blocked request) the client
 * reads `null` and the UI shows "no records" instead of "fetch failed".
 * This module keeps the drop-in shape but routes every failure through the
 * structured logger so the silent bug leaves a breadcrumb.
 *
 * Three helpers are exported:
 *   - parseJsonSafe(res|req)     — drop-in, returns T | null, logs on parse error
 *   - safeFetchJson(input, init) — wraps fetch; returns discriminated result
 *   - safeJson(res, { fallback, context, requireOk }) — same idea as
 *     parseJsonSafe but typed with a caller-provided fallback, optionally
 *     treating non-2xx as failure. Adopt incrementally where a silent
 *     empty state is user-visible.
 */

import { logger } from "@/lib/logger";

/**
 * Parse the JSON body of a Response *or* Request, returning null on parse error.
 *
 * Drop-in replacement for `xxx.json().catch((): null => null)`. On parse
 * failure a warn-level log entry is emitted (url + HTTP status when
 * available + error message); return value is still `null` so caller code
 * needs no further changes.
 *
 * Accepts both `Response` (outgoing fetch reply) and `Request` (incoming
 * handler body) — `.json()` is the same duck-typed method on both.
 *
 * @example
 * ```ts
 * const res = await fetch("/api/admin/foo");
 * if (!res.ok) return;
 * const data = await parseJsonSafe<FooResponse>(res);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseJsonSafe<T = any>(source: Response | Request): Promise<T | null> {
  try {
    return (await source.json()) as T;
  } catch (err) {
    logger.warn("parseJsonSafe: failed to parse JSON body", {
      url: source.url,
      // Response has .status; Request does not.
      status: "status" in source ? (source as Response).status : undefined,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Structured result of `safeFetchJson`. Discriminated on `ok` so callers
 * only see `data: T` after narrowing with `if (result.ok)`.
 */
export type SafeJsonResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      /** Parsed body if the server returned JSON; null on network / parse failure */
      data: T | null;
      error: { kind: "network" | "parse" | "non_ok"; message: string };
    };

/**
 * Fetch wrapper that returns a discriminated result instead of throwing.
 *
 * Surfaces every failure mode distinctly:
 *   - `network` — fetch itself rejected (offline, CORS, DNS)
 *   - `parse`   — HTTP response received but body was not valid JSON
 *   - `non_ok`  — HTTP response received, body parsed, but status was not 2xx
 *     (the parsed `data` is still exposed so callers can render `data.error`)
 *
 * Prefer this in new code when the caller wants to render different UI
 * per failure kind. For existing `fetch + .json().catch` callsites,
 * `parseJsonSafe(res)` is the minimal drop-in.
 */
export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<SafeJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("safeFetchJson: network error", {
      url: String(input),
      error: message,
    });
    return {
      ok: false,
      status: 0,
      data: null,
      error: { kind: "network", message },
    };
  }

  // 204 No Content / 205 Reset Content are successful responses with an
  // empty body. Calling res.json() on them would throw and we'd misreport
  // the request as a parse failure. Return ok:true with data=null so
  // callers can treat "no-content success" identically to "success with
  // null body" — at the call site `data` is typed `T | null` anyway after
  // narrowing via `if (result.ok)`.
  if (res.status === 204 || res.status === 205) {
    return { ok: true, status: res.status, data: null as T };
  }

  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("safeFetchJson: JSON parse failed", {
      url: res.url,
      status: res.status,
      error: message,
    });
    return {
      ok: false,
      status: res.status,
      data: null,
      error: { kind: "parse", message },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      error: { kind: "non_ok", message: `HTTP ${res.status}` },
    };
  }

  return { ok: true, status: res.status, data };
}

/**
 * Fallback-typed variant of parseJsonSafe. Returns `fallback` on parse
 * failure and (optionally) on non-2xx responses.
 *
 * Prefer this when the caller already owns an explicit empty/default value
 * for the response shape — `safeJson` removes the `| null` from the return
 * type so you get a concrete `T` back.
 *
 * @example
 * ```ts
 * const data = await safeJson(res, {
 *   fallback: { orders: [] as Order[] },
 *   context: "admin.orders",
 * });
 * ```
 */
export type SafeJsonOptions<T> = {
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
