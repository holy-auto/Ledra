/**
 * 共有 Stripe クライアント
 * - シングルトンで管理 (apiVersion / timeout / maxNetworkRetries を一箇所で固定)
 * - SDK 内蔵 retry は無効化 (`maxNetworkRetries: 0`) し withRetry("stripe", ...) に委譲
 *   理由: circuit breaker + Sentry breadcrumb 一元化、二重リトライ防止
 *
 * すべての API メソッド呼び出し (create / retrieve / update / list / ...) は
 * Proxy 経由で自動的に withRetry("stripe", ...) を経由する。call site での
 * 明示的なラップは不要 (idempotencyKey の付与は呼び出し側の責務)。
 *
 * Proxy 設計:
 * - RETRYABLE_METHODS に列挙したメソッド名のみ wrap (constructEvent 等は除外)
 * - 深さ 3 まで再帰 (`stripe.<group>.<resource>.<method>`)
 * - 非関数プロパティと未登録メソッドはそのまま透過
 */
import Stripe from "stripe";
import { withRetry } from "@/lib/http/withRetry";

const STRIPE_API_VERSION = "2026-02-25.clover" as Stripe.LatestApiVersion;

/**
 * Stripe API のメソッド名で「リトライしてよい」ものだけを許可。
 * webhooks.constructEvent のような署名検証系は含めない (一過性 5xx ではなく
 * permanent error が主で、retry すると無駄)。
 */
const RETRYABLE_METHODS = new Set([
  "create",
  "retrieve",
  "update",
  "list",
  "del",
  "cancel",
  "capture",
  "confirm",
  "createLoginLink",
  "createBalanceTransaction",
  "finalizeInvoice",
  "sendInvoice",
  "voidInvoice",
  "markUncollectible",
  "pay",
  "send",
  "search",
  "processPaymentIntent",
  "expire",
  "verifyMicrodeposits",
]);

function wrapForRetry<T extends object>(target: T, depth = 0): T {
  if (depth >= 3) return target;
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof prop === "string" && typeof value === "function" && RETRYABLE_METHODS.has(prop)) {
        const fn = value as (...a: unknown[]) => Promise<unknown>;
        return function (this: unknown, ...args: unknown[]) {
          return withRetry("stripe", () => fn.apply(t, args));
        };
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return wrapForRetry(value as object, depth + 1);
      }
      return value;
    },
  });
}

let _client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_client) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const raw = new Stripe(apiKey, {
      apiVersion: STRIPE_API_VERSION,
      timeout: 30_000,
      maxNetworkRetries: 0,
    });
    _client = wrapForRetry(raw);
  }
  return _client;
}
