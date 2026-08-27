import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiresAt,
  OTP_DIGITS,
  OTP_DEFAULT_TTL_MIN,
  OTP_DEFAULT_MAX_ATTEMPTS,
} from "../otp";

const SECRET = "test-secret-key-for-hmac";
const SCOPE = "staff|v1|tenant-123|user@example.com";

describe("generateOtp()", () => {
  it("returns a 6-digit string", () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toHaveLength(OTP_DIGITS);
  });

  it("pads with leading zeros", () => {
    // 確率的テスト：1000 回生成して全て 6 桁
    for (let i = 0; i < 1000; i++) {
      expect(generateOtp()).toHaveLength(6);
    }
  });
});

describe("hashOtp()", () => {
  it("returns a hex string", () => {
    const hash = hashOtp("123456", SCOPE, SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
  });

  it("is deterministic", () => {
    const a = hashOtp("123456", SCOPE, SECRET);
    const b = hashOtp("123456", SCOPE, SECRET);
    expect(a).toBe(b);
  });

  it("differs for different codes", () => {
    const a = hashOtp("123456", SCOPE, SECRET);
    const b = hashOtp("654321", SCOPE, SECRET);
    expect(a).not.toBe(b);
  });

  it("differs for different scopes", () => {
    const a = hashOtp("123456", SCOPE, SECRET);
    const b = hashOtp("123456", "other-scope", SECRET);
    expect(a).not.toBe(b);
  });
});

describe("verifyOtp()", () => {
  const code = "123456";
  const hash = hashOtp(code, SCOPE, SECRET);
  const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const pastExpiry = new Date(Date.now() - 1000).toISOString();

  it("accepts a valid code", () => {
    const result = verifyOtp(code, hash, SCOPE, SECRET, futureExpiry, 0);
    expect(result).toEqual({ valid: true });
  });

  it("rejects an expired code", () => {
    const result = verifyOtp(code, hash, SCOPE, SECRET, pastExpiry, 0);
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects when max attempts exceeded", () => {
    const result = verifyOtp(code, hash, SCOPE, SECRET, futureExpiry, OTP_DEFAULT_MAX_ATTEMPTS);
    expect(result).toEqual({ valid: false, reason: "max_attempts" });
  });

  it("rejects a wrong code", () => {
    const result = verifyOtp("000000", hash, SCOPE, SECRET, futureExpiry, 0);
    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("respects custom max attempts", () => {
    expect(verifyOtp(code, hash, SCOPE, SECRET, futureExpiry, 1, 1)).toEqual({
      valid: false,
      reason: "max_attempts",
    });
    expect(verifyOtp(code, hash, SCOPE, SECRET, futureExpiry, 1, 2).valid).toBe(true);
  });

  it("checks attempts before expiry (fast fail)", () => {
    // 両方失敗の場合、max_attempts が先に判定される
    const result = verifyOtp(code, hash, SCOPE, SECRET, pastExpiry, OTP_DEFAULT_MAX_ATTEMPTS);
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toBe("max_attempts");
  });
});

describe("otpExpiresAt()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a date TTL minutes in the future", () => {
    const expires = otpExpiresAt(OTP_DEFAULT_TTL_MIN);
    expect(expires).toBe("2026-08-19T10:05:00.000Z");
  });

  it("accepts custom TTL", () => {
    const expires = otpExpiresAt(10);
    expect(expires).toBe("2026-08-19T10:10:00.000Z");
  });
});

describe("constants", () => {
  it("has sane defaults", () => {
    expect(OTP_DIGITS).toBe(6);
    expect(OTP_DEFAULT_TTL_MIN).toBe(5);
    expect(OTP_DEFAULT_MAX_ATTEMPTS).toBe(3);
  });
});
