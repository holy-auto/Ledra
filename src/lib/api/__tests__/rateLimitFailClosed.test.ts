/**
 * B-M1 回帰確認 (2026-09-08): "auth" / "sensitive" プリセットは
 * RATE_LIMIT_FAIL_CLOSED の設定に関わらず、Redis 障害時に常に 503 で
 * フェイルクローズすること。他のプリセット (例: "general") は
 * 従来どおりフェイルオープン (素通り) すること。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const { limitMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {},
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    constructor() {}
    async limit(...args: unknown[]) {
      return limitMock(...args);
    }
  }
  return { Ratelimit };
});

describe("checkRateLimit — auth/sensitive フェイルクローズ固定", () => {
  const req = () => new Request("https://app.example.com/api/v1/x", { headers: { "x-real-ip": "203.0.113.9" } });
  let checkRateLimit: typeof import("@/lib/api/rateLimit").checkRateLimit;

  beforeAll(async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    delete process.env.RATE_LIMIT_FAIL_CLOSED;
    ({ checkRateLimit } = await import("@/lib/api/rateLimit"));
  });

  beforeEach(() => {
    limitMock.mockReset();
    limitMock.mockRejectedValue(new Error("redis connection refused"));
  });

  it("auth: RATE_LIMIT_FAIL_CLOSED 未設定でも Redis 障害時は 503 を返す", async () => {
    const res = await checkRateLimit(req(), "auth");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  it("sensitive: RATE_LIMIT_FAIL_CLOSED 未設定でも Redis 障害時は 503 を返す", async () => {
    const res = await checkRateLimit(req(), "sensitive");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  it("general: RATE_LIMIT_FAIL_CLOSED 未設定なら Redis 障害時も素通り (フェイルオープン) する", async () => {
    const res = await checkRateLimit(req(), "general");
    expect(res).toBeNull();
  });
});
