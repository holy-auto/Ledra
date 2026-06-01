import { describe, it, expect } from "vitest";
import {
  computeSupplyWebhookSignature,
  verifySupplyWebhookSignature,
  generateSupplyWebhookSecret,
} from "../webhookSignature";

const SECRET = "whsec_testsecret_abc123";
const BODY = JSON.stringify({ po_number: "PO-20260601-1234", status: "accepted" });

describe("computeSupplyWebhookSignature", () => {
  it("produces a stable sha256=<hex> signature", () => {
    const sig = computeSupplyWebhookSignature(BODY, SECRET);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(computeSupplyWebhookSignature(BODY, SECRET)).toBe(sig); // deterministic
  });
  it("changes with body or secret", () => {
    const base = computeSupplyWebhookSignature(BODY, SECRET);
    expect(computeSupplyWebhookSignature(BODY + " ", SECRET)).not.toBe(base);
    expect(computeSupplyWebhookSignature(BODY, SECRET + "x")).not.toBe(base);
  });
});

describe("verifySupplyWebhookSignature", () => {
  it("accepts a correct signature", () => {
    const sig = computeSupplyWebhookSignature(BODY, SECRET);
    expect(verifySupplyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });
  it("rejects a tampered body", () => {
    const sig = computeSupplyWebhookSignature(BODY, SECRET);
    expect(verifySupplyWebhookSignature(BODY + "tampered", sig, SECRET)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    const sig = computeSupplyWebhookSignature(BODY, SECRET);
    expect(verifySupplyWebhookSignature(BODY, sig, "whsec_wrong")).toBe(false);
  });
  it("rejects missing header or secret", () => {
    expect(verifySupplyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifySupplyWebhookSignature(BODY, "sha256=abc", null)).toBe(false);
  });
  it("rejects a malformed/short signature without throwing", () => {
    expect(verifySupplyWebhookSignature(BODY, "garbage", SECRET)).toBe(false);
  });
});

describe("generateSupplyWebhookSecret", () => {
  it("produces a whsec_ prefixed 48-hex secret, unique each call", () => {
    const a = generateSupplyWebhookSecret();
    const b = generateSupplyWebhookSecret();
    expect(a).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});
