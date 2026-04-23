/**
 * Rate limiter for API routes with Upstash Redis support.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars are set,
 * uses Upstash Redis for distributed rate limiting across serverless instances.
 * Otherwise, falls back to the in-memory sliding-window counter (best-effort,
 * not shared across instances).
 *
 * The return type is `RateLimitResult | Promise<RateLimitResult>`:
 * - In-memory (no env vars): returns synchronous `RateLimitResult`
 * - Upstash Redis: returns `Promise<RateLimitResult>` — callers should `await`
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Types (unchanged)
// ---------------------------------------------------------------------------

type Entry = { count: number; resetAt: number };

type RateLimitOptions = {
  /** Maximum requests allowed within the window */
  limit: number;
  /** Window duration in seconds */
  windowSec: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

// ---------------------------------------------------------------------------
// Upstash Redis singleton
// ---------------------------------------------------------------------------

let redis: Redis | null | undefined; // undefined = not initialised yet

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
  } else {
    redis = null;
  }
  return redis;
}

// Cache Ratelimit instances per (limit, windowSec) pair to avoid re-creation.
const limiterCache = new Map<string, Ratelimit>();

function getUpstashLimiter(opts: RateLimitOptions): Ratelimit {
  const cacheKey = `${opts.limit}:${opts.windowSec}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSec} s`),
      prefix: "rl:lib",
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

// ---------------------------------------------------------------------------
// In-memory fallback (original implementation)
// ---------------------------------------------------------------------------

const buckets = new Map<string, Entry>();

// Periodically clean up expired entries to prevent memory leaks
const CLEANUP_INTERVAL = 60_000; // 1 min
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

function checkRateLimitInMemory(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    // New window
    buckets.set(key, { count: 1, resetAt: now + opts.windowSec * 1000 });
    return { allowed: true, remaining: opts.limit - 1, retryAfterSec: 0 };
  }

  existing.count += 1;

  if (existing.count > opts.limit) {
    const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: opts.limit - existing.count, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Upstash Redis implementation
// ---------------------------------------------------------------------------

async function checkRateLimitRedis(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(opts);
  const result = await limiter.limit(key);

  if (!result.success) {
    const retryAfterSec = Math.ceil((result.reset - Date.now()) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(retryAfterSec, 0) };
  }

  return { allowed: true, remaining: result.remaining, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key.
 *
 * When Upstash Redis is configured (UPSTASH_REDIS_REST_URL / _TOKEN env vars),
 * returns a `Promise<RateLimitResult>` — callers should `await` the result.
 * When Redis is not configured, returns a synchronous `RateLimitResult`
 * (backward-compatible with existing callers).
 *
 * @example
 * ```ts
 * const ip = req.headers.get("x-forwarded-for") ?? "unknown";
 * const rl = await checkRateLimit(`otp:${ip}`, { limit: 5, windowSec: 300 });
 * if (!rl.allowed) {
 *   return NextResponse.json({ error: "rate_limited" }, { status: 429 });
 * }
 * ```
 */
export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const r = getRedis();
  if (r) {
    return checkRateLimitRedis(key, opts);
  }
  return checkRateLimitInMemory(key, opts);
}

/**
 * Extract client IP from request headers.
 *
 * 優先順位:
 *   1. `cf-connecting-ip`   (Cloudflare)
 *   2. `true-client-ip`     (Akamai / Cloudflare Enterprise)
 *   3. `x-real-ip`          (Nginx / Vercel が直接書き込む)
 *   4. `x-forwarded-for`    (左端 = クライアント)
 *
 * いずれも取得できないときは `unknown:<UA-hash>` を返し、全員が同じバケットを
 * 共有しないようにする (DOS 緩和)。
 */
export function getClientIp(req: Request): string {
  const h = req.headers;
  const ip =
    h.get("cf-connecting-ip")?.trim() ||
    h.get("true-client-ip")?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) return ip;

  // unknown を 1 バケット共有にすると、匿名 UA からのスパイクで全員が 429 に
  // なるため、UA を簡易ハッシュしてバケットを分散させる。
  const ua = h.get("user-agent") ?? "";
  let hash = 0;
  for (let i = 0; i < ua.length; i++) {
    hash = (hash * 31 + ua.charCodeAt(i)) | 0;
  }
  return `unknown:${(hash >>> 0).toString(36)}`;
}
