import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  const ORIGINAL_TRUST_CF = process.env.TRUST_CF_HEADERS;
  afterEach(() => {
    if (ORIGINAL_TRUST_CF === undefined) delete process.env.TRUST_CF_HEADERS;
    else process.env.TRUST_CF_HEADERS = ORIGINAL_TRUST_CF;
  });

  // B-H2 是正 (2026-09-08): cf-connecting-ip / true-client-ip はクライアントが
  // 任意の値を送れるヘッダで、本番 (Vercel 直配信) はこれを剥がさない。
  // 毎リクエスト別の値を付けるだけで IP レート制限を迂回できたため、
  // 既定では無視し x-forwarded-for の先頭 (Vercel が上書き) を最優先にする。
  it("ignores cf-connecting-ip by default (spoofable, not trusted unless opted in)", () => {
    delete process.env.TRUST_CF_HEADERS;
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "3.3.3.3",
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "2.2.2.2",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "2.2.2.2",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "2.2.2.2" },
    });
    expect(getClientIp(req)).toBe("2.2.2.2");
  });

  it("uses cf-connecting-ip only when TRUST_CF_HEADERS=1 is explicitly set", () => {
    process.env.TRUST_CF_HEADERS = "1";
    const req = new Request("http://localhost", {
      headers: { "cf-connecting-ip": "3.3.3.3" },
    });
    expect(getClientIp(req)).toBe("3.3.3.3");
  });

  // code-review 指摘の回帰確認 (2026-09-08): TRUST_CF_HEADERS=1 のとき、
  // Cloudflare はクライアントが送った x-forwarded-for を上書きせず末尾に
  // 追記するだけなので、その**先頭**は依然クライアントが偽装できる。
  // cf-connecting-ip（CF エッジが検証する値）を先に見ないと、TRUST_CF_HEADERS
  // を有効にした意味が丸ごと消えて B-H2 の穴が CF 前段構成で再発する。
  it("prefers cf-connecting-ip over a spoofed x-forwarded-for when TRUST_CF_HEADERS=1", () => {
    process.env.TRUST_CF_HEADERS = "1";
    const req = new Request("http://localhost", {
      headers: {
        // 攻撃者が自由に書ける先頭 IP（CF は既存の x-forwarded-for を
        // 上書きせず末尾に実 IP を追記するだけなので、そのまま残る）。
        "x-forwarded-for": "1.2.3.4, 9.9.9.9",
        // CF エッジが検証・設定する、偽装不可能な値。
        "cf-connecting-ip": "9.9.9.9",
      },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
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
