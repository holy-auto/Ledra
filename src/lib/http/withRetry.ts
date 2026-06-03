/**
 * Retry + circuit breaker for outbound HTTP / SDK calls.
 *
 * Wraps a thunk that returns a Promise. Retries on transient errors with
 * exponential backoff + jitter, and trips a per-key circuit so a hard-down
 * upstream stops thrashing our event loop.
 *
 *   await withRetry("stripe", () => stripe.checkoutSessions.create({...}))
 *
 * Use for: Stripe, Resend, Polygon RPC, QStash publish, Square API,
 * Cloudflare Stream API. Do NOT wrap Supabase Postgrest calls — those
 * have their own pooler and retry semantics.
 */

import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/upstash";

type RetryableThunk<T> = () => Promise<T>;

export interface RetryOptions {
  /** Maximum attempts (incl. the first). Default 4 → 1 try + 3 retries. */
  maxAttempts?: number;
  /** Initial backoff ms. Default 250. */
  initialDelayMs?: number;
  /** Backoff multiplier. Default 2 (250 → 500 → 1000 → 2000). */
  multiplier?: number;
  /** Hard cap per attempt's delay. Default 8000. */
  maxDelayMs?: number;
  /** Predicate: should this error trigger a retry? Default = transient errors only. */
  isRetryable?: (error: unknown) => boolean;
  /** Optional AbortSignal — cancels remaining retries. */
  signal?: AbortSignal;
}

interface BreakerState {
  /** Consecutive failures since last success. */
  consecutiveFailures: number;
  /** Until this Unix-ms timestamp the breaker is "open" (rejecting calls). */
  openUntil: number;
}

const breakers = new Map<string, BreakerState>();

const FAILURES_TO_OPEN = 5;
const OPEN_FOR_MS = 30_000;

function defaultIsRetryable(error: unknown): boolean {
  if (!error) return false;
  const e = error as { status?: number; statusCode?: number; code?: string; name?: string; message?: string };
  const status = e.status ?? e.statusCode;
  if (typeof status === "number") {
    if (status === 408 || status === 425 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }
  // Network-layer errors: AbortError is intentional, don't retry.
  if (e.name === "AbortError") return false;
  if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT" || e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") {
    return true;
  }
  // Fetch-style network error
  if (typeof e.message === "string" && /fetch failed|network|timeout/i.test(e.message)) return true;
  return false;
}

function jitter(ms: number): number {
  // ±20% jitter to avoid thundering herd on retry waves.
  const span = ms * 0.4;
  return Math.round(ms - span / 2 + Math.random() * span);
}

export class CircuitOpenError extends Error {
  constructor(public readonly key: string) {
    super(`circuit_open:${key}`);
    this.name = "CircuitOpenError";
  }
}

/** Test-only — reset breaker state. */
export function __resetBreakersForTest(): void {
  breakers.clear();
}

const METRIC_TTL_SECS = 86400 * 7; // 7 days

function recordCallMetric(key: string, success: boolean, latencyMs: number): void {
  const redis = getRedis();
  if (!redis) return;
  const entry = JSON.stringify({ t: Date.now(), ok: success ? 1 : 0, ms: latencyMs });
  void (async () => {
    try {
      const listKey = `ihealth:${key}`;
      await redis.lpush(listKey, entry);
      await redis.ltrim(listKey, 0, 199);
      await redis.expire(listKey, METRIC_TTL_SECS);
    } catch {
      // never let metrics recording affect the main call path
    }
  })();
}

export async function withRetry<T>(key: string, thunk: RetryableThunk<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const initialDelayMs = opts.initialDelayMs ?? 250;
  const multiplier = opts.multiplier ?? 2;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;

  const startMs = Date.now();

  const breaker = breakers.get(key) ?? { consecutiveFailures: 0, openUntil: 0 };

  if (breaker.openUntil > Date.now()) {
    recordCallMetric(key, false, 0);
    throw new CircuitOpenError(key);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) throw new Error("aborted");
    try {
      const result = await thunk();
      breaker.consecutiveFailures = 0;
      breaker.openUntil = 0;
      breakers.set(key, breaker);
      recordCallMetric(key, true, Date.now() - startMs);
      return result;
    } catch (error) {
      lastError = error;
      const retryable = isRetryable(error);
      if (!retryable || attempt === maxAttempts) {
        breaker.consecutiveFailures += 1;
        if (breaker.consecutiveFailures >= FAILURES_TO_OPEN) {
          breaker.openUntil = Date.now() + OPEN_FOR_MS;
          logger.warn("circuit breaker opened", { key, failures: breaker.consecutiveFailures });
        }
        breakers.set(key, breaker);
        recordCallMetric(key, false, Date.now() - startMs);
        throw error;
      }
      const delay = Math.min(initialDelayMs * Math.pow(multiplier, attempt - 1), maxDelayMs);
      const sleepMs = jitter(delay);
      logger.debug("withRetry: retrying", { key, attempt, sleepMs });
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }

  throw lastError;
}
