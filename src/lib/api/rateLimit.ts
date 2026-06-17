import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
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

/**
 * プリセット: AI ルート (20 req / 60s)。
 *
 * Anthropic Vision / LLM を呼ぶ route 用。テナント単位の identifier と組み合わせ、
 * 課金爆発と意図しないループ呼び出しを抑止する。precheck (rule-based のみ) は
 * Vision を呼ばないため軽いが、同経路に乗せて 1 ユーザの暴走を防ぐ。
 */
const aiLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "rl:ai" });
};

/**
 * プリセット: ファイルアップロード (10 req / 60s)。
 *
 * 画像 / PDF アップロード route 用。ストレージ DoS と画像処理 (sharp / OCR)
 * の CPU 爆発を抑止する。general (60/min) より厳しい上限を意図的にかけ、
 * 1 セッションが大量ファイルで Storage を埋め尽くすシナリオを防ぐ。
 */
const uploadLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:upload" });
};

/**
 * プリセット: 身分証 OCR (10 req / 600s).
 *
 * 顧客フォーム自動入力のための AI Vision OCR (`/api/identity/ocr`) 専用.
 * 1 リクエストあたり Sonnet Vision 1 コールが走るため、`ai` (20/60s) より厳しく.
 * テナント単位 + IP 単位の二重制限を route 側で重ねる前提。
 */
const identityOcrLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(10, "600 s"), prefix: "rl:identity-ocr" });
};

/**
 * プリセット: 機微フロー (5 req / 300s)。
 *
 * OTP / パスワードリセット / メール送信を伴うフローのブルートフォース対策。
 * アカウント列挙攻撃の精度も同時に下げる。
 */
const sensitiveLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(5, "300 s"), prefix: "rl:sensitive" });
};

/**
 * プリセット: middleware 層の blanket limit (300 req / 60s)。
 *
 * proxy.ts から /api/* に対して第一線の IP ベース防御として適用する。
 * 通常の admin 操作 (連続フェッチで数十 req/min) は十分余裕があり、
 * 明らかな bulk scraping / bruteforce のみ遮断する設計。個別 route の
 * tighter preset (auth / mobile_pos など) は後段で重ねて働く。
 */
const middlewareDefaultLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(300, "60 s"), prefix: "rl:mw" });
};

/**
 * プリセット: admin の破壊的操作 (POST/PUT/PATCH/DELETE) (60 req / 60s)。
 *
 * proxy.ts から /api/admin/* の write メソッドにかかる。通常 UI 経由での
 * 単発操作は秒間 1〜2 req に収まるため十分。盗まれたセッションでの
 * 一括削除 / 一括書換を抑止することが目的。誤検知を避けるため bulk
 * import / migration は専用 mobile_* preset を route 単位で再宣言する。
 */
const adminWriteLimiter = () => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(60, "60 s"), prefix: "rl:admin-write" });
};

export type RateLimitPreset =
  | "general"
  | "auth"
  | "webhook"
  | "mobile_pos"
  | "mobile_terminal"
  | "middleware_default"
  | "admin_write"
  | "ai"
  | "upload"
  | "sensitive"
  | "identity_ocr";

const presets: Record<RateLimitPreset, () => Ratelimit | null> = {
  general: generalLimiter,
  auth: authLimiter,
  webhook: webhookLimiter,
  mobile_pos: mobilePosLimiter,
  mobile_terminal: mobileTerminalLimiter,
  middleware_default: middlewareDefaultLimiter,
  admin_write: adminWriteLimiter,
  ai: aiLimiter,
  upload: uploadLimiter,
  sensitive: sensitiveLimiter,
  identity_ocr: identityOcrLimiter,
};

/**
 * リクエストのIPアドレスを取得。Cloudflare / Vercel / 通常プロキシに対応し、
 * 取得できない場合は User-Agent でバケットを分散させる。
 */
import { getClientIp as getClientIpCore } from "@/lib/rateLimit";
function getClientIp(req: Request): string {
  return getClientIpCore(req);
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
  req: Request,
  preset: RateLimitPreset = "general",
  /** カスタム識別子（userId など）。省略時は IP アドレスを使用 */
  identifier?: string,
) {
  // Fail-closed mode: when RATE_LIMIT_FAIL_CLOSED=1 and Redis is unreachable,
  // reject requests with 503 instead of silently allowing them. Recommended
  // for high-security deployments where DDoS exposure during a Redis outage
  // is worse than a brief availability hit. Defaults to fail-open to match
  // historical behavior — opt in explicitly.
  const failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "1";

  const limiter = presets[preset]();
  if (!limiter) {
    // Redis 未設定 — fail-closed なら 503、そうでなければ Sentry 報告のみで通過。
    const msg =
      "[rateLimit] Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing). Rate limiting is disabled.";
    if (process.env.NODE_ENV === "production") {
      console.error(msg);
      import("@sentry/nextjs").then((Sentry) => Sentry.captureMessage(msg, "error")).catch(() => {});
    } else {
      console.warn(msg);
    }
    if (failClosed) {
      return apiError({
        code: "rate_limit_unavailable",
        message: "レート制限サービスが利用できません。しばらく経ってから再度お試しください。",
        status: 503,
      });
    }
    return null;
  }

  const id = identifier || getClientIp(req);

  let result: Awaited<ReturnType<typeof limiter.limit>>;
  try {
    result = await limiter.limit(id);
  } catch (limiterErr) {
    // Redis 接続エラー — fail-closed なら 503、そうでなければ Sentry 報告のみで通過。
    console.error("[rateLimit] Redis error during limit check:", limiterErr);
    import("@sentry/nextjs").then((Sentry) => Sentry.captureException(limiterErr)).catch(() => {});
    if (failClosed) {
      return apiError({
        code: "rate_limit_unavailable",
        message: "レート制限サービスが利用できません。しばらく経ってから再度お試しください。",
        status: 503,
      });
    }
    return null;
  }

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
