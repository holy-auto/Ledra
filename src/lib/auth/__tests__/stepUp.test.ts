import { describe, it, expect } from "vitest";
import {
  STEP_UP_OPERATIONS,
  STEP_UP_METHODS,
  DEFAULT_STEP_UP_REQUIREMENTS,
  requiresStepUp,
  availableStepUpMethods,
} from "../stepUp";

describe("constants", () => {
  it("defines 7 step-up operations", () => {
    expect(STEP_UP_OPERATIONS).toHaveLength(7);
    expect(STEP_UP_OPERATIONS).toContain("certificate_finalize");
    expect(STEP_UP_OPERATIONS).toContain("payment_approve");
  });

  it("defines 3 step-up methods", () => {
    expect(STEP_UP_METHODS).toEqual(["webauthn", "totp", "otp_reverify"]);
  });

  it("has a default requirement for every operation", () => {
    for (const op of STEP_UP_OPERATIONS) {
      expect(DEFAULT_STEP_UP_REQUIREMENTS.find((r) => r.operation === op)).toBeDefined();
    }
  });
});

describe("requiresStepUp()", () => {
  it("requires step-up for certificate_finalize regardless of trust", () => {
    expect(requiresStepUp("certificate_finalize", "trusted")).toBe(true);
    expect(requiresStepUp("certificate_finalize", "recognized")).toBe(true);
    expect(requiresStepUp("certificate_finalize", "unknown")).toBe(true);
  });

  it("skips step-up for device_revoke on trusted devices", () => {
    expect(requiresStepUp("device_revoke", "trusted")).toBe(false);
    expect(requiresStepUp("device_revoke", "recognized")).toBe(true);
    expect(requiresStepUp("device_revoke", "unknown")).toBe(true);
  });

  it("skips step-up for data_export on trusted devices", () => {
    expect(requiresStepUp("data_export", "trusted")).toBe(false);
    expect(requiresStepUp("data_export", "recognized")).toBe(true);
  });
});

describe("availableStepUpMethods()", () => {
  it("returns all methods when all factors available", () => {
    const methods = availableStepUpMethods({
      hasPasskey: true,
      hasTotp: true,
      hasVerifiedEmail: true,
    });
    expect(methods).toEqual(["webauthn", "totp", "otp_reverify"]);
  });

  it("returns only webauthn when only passkey available", () => {
    expect(availableStepUpMethods({ hasPasskey: true, hasTotp: false, hasVerifiedEmail: false })).toEqual(["webauthn"]);
  });

  it("returns empty when nothing available", () => {
    expect(availableStepUpMethods({ hasPasskey: false, hasTotp: false, hasVerifiedEmail: false })).toEqual([]);
  });

  it("respects priority order: webauthn > totp > otp_reverify", () => {
    const methods = availableStepUpMethods({
      hasPasskey: true,
      hasTotp: true,
      hasVerifiedEmail: true,
    });
    expect(methods[0]).toBe("webauthn");
    expect(methods[1]).toBe("totp");
    expect(methods[2]).toBe("otp_reverify");
  });
});
