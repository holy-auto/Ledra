import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPassportPublicEnabled } from "../featureGate";

describe("isPassportPublicEnabled", () => {
  const originalEnabled = process.env.PASSPORT_PUBLIC_ENABLED;
  const originalHold = process.env.PASSPORT_PATENT_HOLD;

  beforeEach(() => {
    delete process.env.PASSPORT_PUBLIC_ENABLED;
    delete process.env.PASSPORT_PATENT_HOLD;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.PASSPORT_PUBLIC_ENABLED;
    else process.env.PASSPORT_PUBLIC_ENABLED = originalEnabled;
    if (originalHold === undefined) delete process.env.PASSPORT_PATENT_HOLD;
    else process.env.PASSPORT_PATENT_HOLD = originalHold;
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

  // ── 特許出願ロック (PASSPORT_PATENT_HOLD) ──
  describe("patent hold lock", () => {
    it("forces 404 even when PASSPORT_PUBLIC_ENABLED=true", () => {
      process.env.PASSPORT_PUBLIC_ENABLED = "true";
      for (const v of ["1", "true", "TRUE", "yes", "on", " On "]) {
        process.env.PASSPORT_PATENT_HOLD = v;
        expect(isPassportPublicEnabled()).toBe(false);
      }
    });

    it("does not affect the gate when unset or falsy (local/staging dev keeps working)", () => {
      process.env.PASSPORT_PUBLIC_ENABLED = "true";
      for (const v of ["", "false", "0", "no", "off"]) {
        process.env.PASSPORT_PATENT_HOLD = v;
        expect(isPassportPublicEnabled()).toBe(true);
      }
      delete process.env.PASSPORT_PATENT_HOLD;
      expect(isPassportPublicEnabled()).toBe(true);
    });

    it("keeps routes closed when hold is set and enabled is unset", () => {
      process.env.PASSPORT_PATENT_HOLD = "1";
      expect(isPassportPublicEnabled()).toBe(false);
    });
  });
});
