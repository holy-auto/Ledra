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
    expect(() => normalizeLast4("123")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
    expect(() => normalizeLast4("12345")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
    expect(() => normalizeLast4("abcd")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
    expect(() => normalizeLast4("")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
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

// ─── Edge cases for sha256Hex ───
describe("sha256Hex — edge cases", () => {
  it("hashes empty string consistently", () => {
    const h1 = sha256Hex("");
    const h2 = sha256Hex("");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("hashes unicode/Japanese text", () => {
    const h = sha256Hex("テスト文字列");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes very long input", () => {
    const h = sha256Hex("a".repeat(10000));
    expect(h).toHaveLength(64);
  });

  it("hash differs with whitespace variations", () => {
    expect(sha256Hex("hello")).not.toBe(sha256Hex(" hello"));
    expect(sha256Hex("hello")).not.toBe(sha256Hex("hello "));
  });
});

// ─── Edge cases for normalizeEmail ───
describe("normalizeEmail — edge cases", () => {
  it("handles mixed case with plus addressing", () => {
    expect(normalizeEmail("User+Tag@Example.COM")).toBe("user+tag@example.com");
  });

  it("handles tabs and newlines in whitespace", () => {
    expect(normalizeEmail("\ttest@example.com\n")).toBe("test@example.com");
  });
});

// ─── Edge cases for normalizeLast4 ───
describe("normalizeLast4 — edge cases", () => {
  it("handles full-width digits by rejecting them", () => {
    // Full-width digits ０１２３ should not match /^\d{4}$/
    expect(() => normalizeLast4("０１２３")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
  });

  it("rejects digits with spaces in between", () => {
    expect(() => normalizeLast4("1 2 3 4")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
  });

  it("rejects special characters", () => {
    expect(() => normalizeLast4("12#4")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
  });
});

// ─── phoneLast4Hash includes pepper ───
describe("phoneLast4Hash — pepper dependency", () => {
  it("produces a valid hex hash", () => {
    const h = phoneLast4Hash("tenant-x", "9999");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws for invalid last4 input", () => {
    expect(() => phoneLast4Hash("tenant-x", "abc")).toThrow("電話番号下4桁は半角数字4桁で入力してください");
  });
});

// ─── otpCodeHash ───
describe("otpCodeHash — edge cases", () => {
  it("different email produces different hash", () => {
    const h1 = otpCodeHash("t1", "a@b.com", "ph", "123456");
    const h2 = otpCodeHash("t1", "c@d.com", "ph", "123456");
    expect(h1).not.toBe(h2);
  });

  it("different tenant produces different hash", () => {
    const h1 = otpCodeHash("t1", "a@b.com", "ph", "123456");
    const h2 = otpCodeHash("t2", "a@b.com", "ph", "123456");
    expect(h1).not.toBe(h2);
  });

  it("different phone hash produces different hash", () => {
    const h1 = otpCodeHash("t1", "a@b.com", "ph1", "123456");
    const h2 = otpCodeHash("t1", "a@b.com", "ph2", "123456");
    expect(h1).not.toBe(h2);
  });
});

// ─── randomHex edge cases ───
describe("randomHex — edge cases", () => {
  it("returns empty string for 0 bytes", () => {
    expect(randomHex(0)).toBe("");
  });

  it("returns 2-char hex for 1 byte", () => {
    const h = randomHex(1);
    expect(h).toHaveLength(2);
    expect(h).toMatch(/^[0-9a-f]{2}$/);
  });

  it("returns 64-char hex for 32 bytes", () => {
    const h = randomHex(32);
    expect(h).toHaveLength(64);
  });
});
