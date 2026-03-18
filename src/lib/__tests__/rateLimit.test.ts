import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIp } from "../rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Reset time mocking between tests
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const opts = { limit: 3, windowSec: 60 };

    const r1 = checkRateLimit(key, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", () => {
    const key = `test-block-${Date.now()}`;
    const opts = { limit: 2, windowSec: 60 };

    checkRateLimit(key, opts);
    checkRateLimit(key, opts);

    const r3 = checkRateLimit(key, opts);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSec).toBeGreaterThan(0);
    expect(r3.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("uses separate buckets for different keys", () => {
    const keyA = `test-a-${Date.now()}`;
    const keyB = `test-b-${Date.now()}`;
    const opts = { limit: 1, windowSec: 60 };

    checkRateLimit(keyA, opts);
    const rA = checkRateLimit(keyA, opts);
    expect(rA.allowed).toBe(false);

    const rB = checkRateLimit(keyB, opts);
    expect(rB.allowed).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    const key = `test-reset-${Date.now()}`;
    const opts = { limit: 1, windowSec: 10 };

    checkRateLimit(key, opts);
    const r2 = checkRateLimit(key, opts);
    expect(r2.allowed).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(11_000);

    const r3 = checkRateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns 'unknown' when no IP headers", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});
