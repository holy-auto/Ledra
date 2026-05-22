import { describe, expect, it } from "vitest";
import { generateTransferToken, hashTransferToken, isTransferTokenFormat } from "@/lib/passport/transfers/tokens";

describe("generateTransferToken", () => {
  it("returns a token with the lpt_ prefix", () => {
    const { rawToken, tokenHash } = generateTransferToken();
    expect(rawToken.startsWith("lpt_")).toBe(true);
    expect(rawToken.length).toBeGreaterThan(30);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("recomputes the same hash from the raw token", () => {
    const { rawToken, tokenHash } = generateTransferToken();
    expect(hashTransferToken(rawToken)).toBe(tokenHash);
  });

  it("yields a different hash for a different token", () => {
    const a = generateTransferToken();
    const b = generateTransferToken();
    expect(a.tokenHash).not.toBe(b.tokenHash);
    expect(a.rawToken).not.toBe(b.rawToken);
  });
});

describe("isTransferTokenFormat", () => {
  it("accepts a freshly generated token", () => {
    const { rawToken } = generateTransferToken();
    expect(isTransferTokenFormat(rawToken)).toBe(true);
  });
  it("rejects strings missing the prefix", () => {
    expect(isTransferTokenFormat("abcdefghijklmnopqrstuvwxyz123")).toBe(false);
  });
  it("rejects strings that are too short", () => {
    expect(isTransferTokenFormat("lpt_short")).toBe(false);
  });
});
