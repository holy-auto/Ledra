// env vars set via vitest setup file (setup.ts)
import { describe, it, expect } from "vitest";
import {
  sha256Hex,
  randomHex,
  normalizeEmail,
  normalizeLast4,
  phoneLast4Hash,
  otpCodeHash,
  sessionHash,
  CUSTOMER_COOKIE,
  OTP_TTL_MIN,
  SESSION_TTL_DAYS,
} from "../customerPortalServer";

describe("sha256Hex", () => {
  it("returns consistent hash for same input", () => {
    const h1 = sha256Hex("hello");
    const h2 = sha256Hex("hello");
    expect(h1).toBe(h2);
  });

  it("returns 64-char hex string", () => {
    const h = sha256Hex("test");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different hash for different input", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});

describe("randomHex", () => {
  it("returns hex string of correct length", () => {
    const h = randomHex(16);
    expect(h).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("returns different values each call", () => {
    const h1 = randomHex(16);
    const h2 = randomHex(16);
    expect(h1).not.toBe(h2);
  });
});

describe("normalizeEmail", () => {
  it("trims whitespace", () => {
    expect(normalizeEmail("  test@example.com  ")).toBe("test@example.com");
  });

  it("lowercases", () => {
    expect(normalizeEmail("Test@Example.COM")).toBe("test@example.com");
  });

  it("handles empty string", () => {
    expect(normalizeEmail("")).toBe("");
  });
});

describe("normalizeLast4", () => {
  it("accepts valid 4-digit string", () => {
    expect(normalizeLast4("1234")).toBe("1234");
    expect(normalizeLast4("0000")).toBe("0000");
  });

  it("trims whitespace", () => {
    expect(normalizeLast4(" 5678 ")).toBe("5678");
  });

  it("throws on non-4-digit input", () => {
    expect(() => normalizeLast4("123")).toThrow("phone_last4 must be 4 digits");
    expect(() => normalizeLast4("12345")).toThrow("phone_last4 must be 4 digits");
    expect(() => normalizeLast4("abcd")).toThrow("phone_last4 must be 4 digits");
    expect(() => normalizeLast4("")).toThrow("phone_last4 must be 4 digits");
  });
});

describe("phoneLast4Hash", () => {
  it("returns consistent hash for same tenant + last4", () => {
    const h1 = phoneLast4Hash("tenant-1", "1234");
    const h2 = phoneLast4Hash("tenant-1", "1234");
    expect(h1).toBe(h2);
  });

  it("returns different hash for different tenant", () => {
    const h1 = phoneLast4Hash("tenant-1", "1234");
    const h2 = phoneLast4Hash("tenant-2", "1234");
    expect(h1).not.toBe(h2);
  });

  it("returns different hash for different last4", () => {
    const h1 = phoneLast4Hash("tenant-1", "1234");
    const h2 = phoneLast4Hash("tenant-1", "5678");
    expect(h1).not.toBe(h2);
  });
});

describe("otpCodeHash", () => {
  it("is deterministic", () => {
    const h1 = otpCodeHash("t1", "a@b.com", "phonehash", "123456");
    const h2 = otpCodeHash("t1", "a@b.com", "phonehash", "123456");
    expect(h1).toBe(h2);
  });

  it("differs for different codes", () => {
    const h1 = otpCodeHash("t1", "a@b.com", "ph", "111111");
    const h2 = otpCodeHash("t1", "a@b.com", "ph", "222222");
    expect(h1).not.toBe(h2);
  });
});

describe("sessionHash", () => {
  it("is deterministic", () => {
    const h1 = sessionHash("token-abc");
    const h2 = sessionHash("token-abc");
    expect(h1).toBe(h2);
  });

  it("differs for different tokens", () => {
    expect(sessionHash("a")).not.toBe(sessionHash("b"));
  });
});

describe("constants", () => {
  it("CUSTOMER_COOKIE is defined", () => {
    expect(CUSTOMER_COOKIE).toBe("hc_cs");
  });

  it("OTP_TTL_MIN is 10", () => {
    expect(OTP_TTL_MIN).toBe(10);
  });

  it("SESSION_TTL_DAYS is 30", () => {
    expect(SESSION_TTL_DAYS).toBe(30);
  });
});
