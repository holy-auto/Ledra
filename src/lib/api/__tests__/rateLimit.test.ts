/**
 * checkRateLimit のカスタム上限 (limitPerMinute) と Ratelimit インスタンス
 * キャッシュの検証。@upstash/* をモックし、実 Redis なしで
 * 「どの上限で limiter が構築されたか」「同じ上限で再構築されないか」を見る。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { vi } from "vitest";

const { ctorCalls } = vi.hoisted(() => ({
  ctorCalls: [] as Array<{ limiter: { limit: number; window: string }; prefix: string }>,
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {},
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    constructor(opts: { limiter: { limit: number; window: string }; prefix: string }) {
      ctorCalls.push(opts);
    }
    async limit() {
      return { success: true, remaining: 1, reset: Date.now() + 1000, limit: 0, pending: Promise.resolve() };
    }
  }
  return { Ratelimit };
});

describe("checkRateLimit custom limitPerMinute", () => {
  const req = () => new Request("https://app.example.com/api/v1/x", { headers: { "x-real-ip": "203.0.113.9" } });
  let checkRateLimit: typeof import("@/lib/api/rateLimit").checkRateLimit;

  beforeAll(async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    ({ checkRateLimit } = await import("@/lib/api/rateLimit"));
  });

  it("builds a limiter with the per-consumer limit and caches it", async () => {
    expect(await checkRateLimit(req(), "general", "consumer:a", 500)).toBeNull();
    expect(ctorCalls).toHaveLength(1);
    expect(ctorCalls[0].limiter).toEqual({ limit: 500, window: "60 s" });
    expect(ctorCalls[0].prefix).toBe("rl:custom");

    // 同じ上限では再構築しない (キャッシュ)。
    await checkRateLimit(req(), "general", "consumer:b", 500);
    expect(ctorCalls).toHaveLength(1);

    // 別の上限は別インスタンス。
    await checkRateLimit(req(), "general", "consumer:c", 120);
    expect(ctorCalls).toHaveLength(2);
    expect(ctorCalls[1].limiter).toEqual({ limit: 120, window: "60 s" });
  });

  it("falls back to the preset when the override is unset or invalid", async () => {
    const before = ctorCalls.length;
    await checkRateLimit(req(), "general");
    await checkRateLimit(req(), "general", "consumer:d", 0);
    await checkRateLimit(req(), "general", "consumer:e", NaN);
    // general preset は 1 回だけ構築され、以降はキャッシュされる。
    expect(ctorCalls.length).toBe(before + 1);
    expect(ctorCalls[before].limiter).toEqual({ limit: 60, window: "60 s" });
    expect(ctorCalls[before].prefix).toBe("rl:api");
  });
});
