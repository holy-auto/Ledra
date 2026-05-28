import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPassportPublicEnabled } from "../featureGate";

describe("isPassportPublicEnabled", () => {
  const original = process.env.PASSPORT_PUBLIC_ENABLED;

  beforeEach(() => {
    delete process.env.PASSPORT_PUBLIC_ENABLED;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PASSPORT_PUBLIC_ENABLED;
    } else {
      process.env.PASSPORT_PUBLIC_ENABLED = original;
    }
  });

  it("returns false when unset (production-safe default)", () => {
    expect(isPassportPublicEnabled()).toBe(false);
  });

  it("returns true only for the exact string 'true'", () => {
    process.env.PASSPORT_PUBLIC_ENABLED = "true";
    expect(isPassportPublicEnabled()).toBe(true);
  });

  it("returns false for 'TRUE', '1', 'yes' (strict 'true' match)", () => {
    for (const v of ["TRUE", "True", "1", "yes", "on", ""]) {
      process.env.PASSPORT_PUBLIC_ENABLED = v;
      expect(isPassportPublicEnabled()).toBe(false);
    }
  });

  it("returns false for 'false'", () => {
    process.env.PASSPORT_PUBLIC_ENABLED = "false";
    expect(isPassportPublicEnabled()).toBe(false);
  });
});
