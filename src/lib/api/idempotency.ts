/**
 * Idempotency-Key middleware (Redis-backed).
 *
 * Enterprise / PoC 連携先がリトライ可能な同一リクエストを安全に再送できるよう、
 * `Idempotency-Key` ヘッダ付きの POST / PUT / PATCH に対して
 *   - 同一 (caller, route, key) を Redis で 24h ロック
 *   - 初回: SET NX で claim → ハンドラ実行 → 結果のステータスとボディをキャッシュ
 *   - 二回目以降: キャッシュ済みのレスポンスを再生
 *
 * Stripe スタイルの "request fingerprint" 検証も行い、同一 key で異なる
 * body が来た場合は 409 Conflict を返してデータ整合性を守る。
 *
 * @example
 *   export async function POST(req: NextRequest) {
 *     return withIdempotency(req, "admin:certificates:create", async () => {
 *       // 通常の処理
 *       return apiOk({ ... });
 *     });
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { apiError } from "./response";
import { captureSecurityEvent } from "@/lib/observability/sentry";
import { getClientIp } from "@/lib/rateLimit";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_KEY_LENGTH = 255;
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]+$/;

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

type CachedResponse = {
  status: number;
  body: string;
  contentType: string;
  fingerprint: string;
};

/** Hash request body + caller for fingerprint comparison. */
function fingerprintRequest(scopeId: string, body: string): string {
  return createHash("sha256").update(`${scopeId}\n${body}`).digest("hex");
}

/**
 * Wrap a handler with idempotency semantics.
 *
 * `scope` should be a stable string per route (e.g. "admin:cert:create") to
 * prevent key collisions across different endpoints sharing the same key.
 */
export async function withIdempotency(
  req: NextRequest,
  scope: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  // Only mutating methods need idempotency
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return handler();
  }

  const key = req.headers.get("idempotency-key");
  // Idempotency-Key is opt-in. No header → run handler normally.
  if (!key) return handler();

  // Format guard — reject malformed keys before touching Redis.
  if (key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) {
    return apiError({
      code: "invalid_idempotency_key",
      message: "Idempotency-Key must be ≤255 chars of [A-Za-z0-9_\\-:.] characters.",
      status: 400,
    });
  }

  const r = getRedis();
  // Redis unavailable — fall through. Idempotency is best-effort; the
  // existing rate limit / CSRF layers still apply.
  if (!r) return handler();

  // Scope by caller. We don't have the userId at middleware level so we
  // approximate with IP + scope. Routes that need stricter scoping can pass
  // a userId via the scope string (e.g. `admin:cert:create:${userId}`).
  const callerId = getClientIp(req);
  const scopeId = `${scope}:${callerId}`;
  const redisKey = `idem:${scopeId}:${key}`;

  // Read body once and cache it on the request for the handler to re-use.
  // We need it for fingerprinting; if the handler also reads it, we serve
  // a clone via Request semantics.
  const bodyText = await req.text();
  const fingerprint = fingerprintRequest(scopeId, bodyText);

  // Try to claim the key. SET NX EX = atomic claim with TTL.
  const claimed = await r.set(
    redisKey,
    JSON.stringify({ status: 0, body: "", contentType: "", fingerprint } satisfies CachedResponse),
    { nx: true, ex: IDEMPOTENCY_TTL_SECONDS },
  );

  if (claimed === null) {
    // Key already exists — load the cached entry.
    const cached = await r.get<CachedResponse | string>(redisKey);
    const entry: CachedResponse | null =
      typeof cached === "string" ? (JSON.parse(cached) as CachedResponse) : (cached as CachedResponse | null);

    if (!entry) {
      // Race: claim was deleted between SET NX and GET. Treat as fresh.
      return runAndCache(handler, r, redisKey, fingerprint, req, bodyText);
    }

    // Fingerprint mismatch → reject (different body for same key).
    if (entry.fingerprint && entry.fingerprint !== fingerprint) {
      captureSecurityEvent("idempotency_conflict", {
        scope,
        caller_ip_hash: hashIp(callerId),
        request_id: req.headers.get("x-request-id") ?? null,
      });
      return apiError({
        code: "idempotency_conflict",
        message: "Same Idempotency-Key was used with a different request body.",
        status: 409,
      });
    }

    // In-flight (status=0) → another request is still running. 409 Locked-ish.
    if (entry.status === 0) {
      return apiError({
        code: "idempotency_in_flight",
        message: "A previous request with this Idempotency-Key is still being processed. Retry shortly.",
        status: 409,
      });
    }

    // Replay the cached response.
    return new NextResponse(entry.body, {
      status: entry.status,
      headers: {
        "content-type": entry.contentType || "application/json; charset=utf-8",
        "idempotent-replay": "true",
      },
    });
  }

  // Successfully claimed — restore body for the handler and run.
  return runAndCache(handler, r, redisKey, fingerprint, req, bodyText);
}

async function runAndCache(
  handler: () => Promise<Response>,
  r: Redis,
  redisKey: string,
  fingerprint: string,
  req: NextRequest,
  bodyText: string,
): Promise<Response> {
  // Re-attach the body so the handler can read it via req.json() / req.text().
  // NextRequest is immutable; we wrap it by overriding the prototype method.
  const originalText = req.text.bind(req);
  const originalJson = req.json.bind(req);
  Object.defineProperty(req, "text", {
    value: async () => bodyText,
    configurable: true,
  });
  Object.defineProperty(req, "json", {
    value: async () => (bodyText ? JSON.parse(bodyText) : undefined),
    configurable: true,
  });

  let response: Response;
  try {
    response = await handler();
  } finally {
    Object.defineProperty(req, "text", { value: originalText, configurable: true });
    Object.defineProperty(req, "json", { value: originalJson, configurable: true });
  }

  // Only cache 2xx + 4xx (deterministic outcomes). 5xx errors should be
  // retryable, so don't poison the cache.
  //
  // 401/403 は除く。結果が「誰が呼んだか」で変わるうえ、キーは IP スコープ
  // (getClientIp) なので、権限を付与された後の再送や、同じ NAT の別ユーザーにまで
  // 24 時間その拒否が返り続ける。認可の結果はキャッシュしない。
  const cacheable =
    response.status >= 200 && response.status < 500 && response.status !== 401 && response.status !== 403;
  if (cacheable) {
    try {
      const cloned = response.clone();
      const body = await cloned.text();
      const contentType = response.headers.get("content-type") ?? "application/json; charset=utf-8";
      const entry: CachedResponse = {
        status: response.status,
        body,
        contentType,
        fingerprint,
      };
      await r.set(redisKey, JSON.stringify(entry), { ex: IDEMPOTENCY_TTL_SECONDS });
    } catch {
      // Best-effort cache; don't fail the request if Redis write fails.
    }
  } else {
    // 5xx → release the claim so client can retry.
    await r.del(redisKey).catch(() => {});
  }

  return response;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
