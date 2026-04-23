import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIp } from "../rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Reset time mocking between tests
    vi.useRealTimers();
  });

  it("allows requests within the limit", async () => {
    const key = `test-allow-${Date.now()}`;
    const opts = { limit: 3, windowSec: 60 };

    const r1 = await checkRateLimit(key, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimit(key, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkRateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", async () => {
    const key = `test-block-${Date.now()}`;
    const opts = { limit: 2, windowSec: 60 };

    await checkRateLimit(key, opts);
    await checkRateLimit(key, opts);

    const r3 = await checkRateLimit(key, opts);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSec).toBeGreaterThan(0);
    expect(r3.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("uses separate buckets for different keys", async () => {
    const keyA = `test-a-${Date.now()}`;
    const keyB = `test-b-${Date.now()}`;
    const opts = { limit: 1, windowSec: 60 };

    await checkRateLimit(keyA, opts);
    const rA = await checkRateLimit(keyA, opts);
    expect(rA.allowed).toBe(false);

    const rB = await checkRateLimit(keyB, opts);
    expect(rB.allowed).toBe(true);
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();
    const key = `test-reset-${Date.now()}`;
    const opts = { limit: 1, windowSec: 10 };

    await checkRateLimit(key, opts);
    const r2 = await checkRateLimit(key, opts);
    expect(r2.allowed).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(11_000);

    const r3 = await checkRateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });
});

describe("getClientIp", () => {
  it("prefers cf-connecting-ip over other headers", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "3.3.3.3",
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "2.2.2.2",
      },
    });
    expect(getClientIp(req)).toBe("3.3.3.3");
  });

  it("prefers x-real-ip over x-forwarded-for when cf header absent", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "2.2.2.2",
      },
    });
    expect(getClientIp(req)).toBe("2.2.2.2");
  });

  it("extracts first IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns a UA-bucketed 'unknown:...' when no IP headers", () => {
    const req = new Request("http://localhost");
    const id = getClientIp(req);
    expect(id).toMatch(/^unknown:/);
  });

  it("splits unknown into different buckets per User-Agent", () => {
    const a = getClientIp(new Request("http://localhost", { headers: { "user-agent": "curl/8.0" } }));
    const b = getClientIp(new Request("http://localhost", { headers: { "user-agent": "Mozilla/5.0" } }));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^unknown:/);
    expect(b).toMatch(/^unknown:/);
  });
});
