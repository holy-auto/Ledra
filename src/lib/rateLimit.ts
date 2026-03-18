/**
 * Simple in-memory rate limiter for API routes.
 *
 * Uses a sliding-window counter keyed by IP (or custom key).
 * Not shared across serverless instances — provides best-effort
 * protection. For strict enforcement, swap to Upstash Redis.
 */

type Entry = { count: number; resetAt: number };

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

/**
 * Check rate limit for a given key.
 *
 * @example
 * ```ts
 * const ip = req.headers.get("x-forwarded-for") ?? "unknown";
 * const rl = checkRateLimit(`otp:${ip}`, { limit: 5, windowSec: 300 });
 * if (!rl.allowed) {
 *   return NextResponse.json({ error: "rate_limited" }, { status: 429 });
 * }
 * ```
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
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

/**
 * Extract client IP from request headers.
 * Works with Vercel, Cloudflare, and standard proxies.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
