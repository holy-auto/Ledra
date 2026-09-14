/**
 * Shared Upstash Redis client. Single connection lazily created when env
 * is configured, returns null otherwise (callers must handle the null
 * branch — the absence of Redis is expected in dev/CI).
 *
 * Used by: lib/rateLimit.ts / lib/api/rateLimit.ts (rate limit presets),
 * lib/api/idempotency.ts, lib/ai/costCap.ts, lib/cache.ts,
 * whiteLabel/resolveTenantByHost, and any future cache layer.
 *
 * F-3 是正 (2026-09-08): 以前は上記のうち rateLimit.ts / api/rateLimit.ts /
 * api/idempotency.ts の3ファイルがそれぞれ同じ env から独自に
 * `new Redis(...)` していた（合計4本の接続）。ここに一本化。
 */

import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}
