import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";
import { apiError } from "./response";

/**
 * Upstash Redis ベースのレート制限
 *
 * 環境変数:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * 未設定時はレート制限をスキップ（開発環境向け）
 */

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/** プリセット: 一般 API (60 req / 60s) */
const generalLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(60, "60 s"), prefix: "rl:api" });
};

/** プリセット: 認証系 (10 req / 60s) */
const authLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:auth" });
};

/** プリセット: Webhook / 外部連携 (120 req / 60s) */
const webhookLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(120, "60 s"), prefix: "rl:webhook" });
};

/** プリセット: モバイル POS チェックアウト (10 req / 60s) */
const mobilePosLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:mobile-pos" });
};

/** プリセット: モバイル Terminal (30 req / 60s) */
const mobileTerminalLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(30, "60 s"), prefix: "rl:mobile-terminal" });
};

export type RateLimitPreset = "general" | "auth" | "webhook" | "mobile_pos" | "mobile_terminal";

const presets: Record<RateLimitPreset, () => Ratelimit | null> = {
  general: generalLimiter,
  auth: authLimiter,
  webhook: webhookLimiter,
  mobile_pos: mobilePosLimiter,
  mobile_terminal: mobileTerminalLimiter,
};

/**
 * リクエストのIPアドレスを取得
 */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * API ルートの先頭で呼び出すレート制限チェック。
 * 制限超過時は 429 レスポンスを返す。null なら通過。
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const limited = await checkRateLimit(req, "auth");
 *   if (limited) return limited;
 *   // ... 通常処理
 * }
 */
export async function checkRateLimit(
  req: NextRequest,
  preset: RateLimitPreset = "general",
  /** カスタム識別子（userId など）。省略時は IP アドレスを使用 */
  identifier?: string,
) {
  const limiter = presets[preset]();
  if (!limiter) return null; // Redis 未設定 → スキップ

  const id = identifier || getClientIp(req);
  const result = await limiter.limit(id);

  if (!result.success) {
    return apiError({
      code: "rate_limited",
      message: "リクエスト回数の上限に達しました。しばらく経ってから再度お試しください。",
      status: 429,
      data: {
        retry_after: Math.ceil((result.reset - Date.now()) / 1000),
      },
    });
  }

  return null;
}
