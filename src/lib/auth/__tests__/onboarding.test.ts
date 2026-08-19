import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS,
  nextStep,
  isValidTransition,
  hasReached,
  isOnboardingComplete,
  advanceStep,
  type OnboardingSession,
} from "../onboarding";

const NOW = "2026-08-19T00:00:00Z";
const LATER = "2026-08-19T01:00:00Z";

function makeSession(step: (typeof ONBOARDING_STEPS)[number]): OnboardingSession {
  return {
    userId: "user-1",
    currentStep: step,
    startedAt: NOW,
    updatedAt: NOW,
  };
}

describe("ONBOARDING_STEPS", () => {
  it("has 6 steps in canonical order", () => {
    expect(ONBOARDING_STEPS).toEqual([
      "INVITED",
      "LANGUAGE_SET",
      "OTP_VERIFIED",
      "STORE_ASSIGNED",
      "BIOMETRIC_ENROLLED",
      "ACTIVE",
    ]);
  });
});

describe("nextStep()", () => {
  it("returns the next step for each non-terminal step", () => {
    expect(nextStep("INVITED")).toBe("LANGUAGE_SET");
    expect(nextStep("LANGUAGE_SET")).toBe("OTP_VERIFIED");
    expect(nextStep("OTP_VERIFIED")).toBe("STORE_ASSIGNED");
    expect(nextStep("STORE_ASSIGNED")).toBe("BIOMETRIC_ENROLLED");
    expect(nextStep("BIOMETRIC_ENROLLED")).toBe("ACTIVE");
  });

  it("returns null for ACTIVE (terminal)", () => {
    expect(nextStep("ACTIVE")).toBeNull();
  });
});

describe("isValidTransition()", () => {
  it("accepts forward-by-one transitions", () => {
    expect(isValidTransition("INVITED", "LANGUAGE_SET")).toBe(true);
    expect(isValidTransition("OTP_VERIFIED", "STORE_ASSIGNED")).toBe(true);
  });

  it("rejects backward transitions", () => {
    expect(isValidTransition("LANGUAGE_SET", "INVITED")).toBe(false);
  });

  it("rejects skipping steps", () => {
    expect(isValidTransition("INVITED", "OTP_VERIFIED")).toBe(false);
  });

  it("rejects same-step transition", () => {
    expect(isValidTransition("INVITED", "INVITED")).toBe(false);
  });
});

describe("hasReached()", () => {
  it("returns true when at or past target", () => {
    expect(hasReached("ACTIVE", "INVITED")).toBe(true);
    expect(hasReached("OTP_VERIFIED", "OTP_VERIFIED")).toBe(true);
  });

  it("returns false when before target", () => {
    expect(hasReached("INVITED", "OTP_VERIFIED")).toBe(false);
  });
});

describe("isOnboardingComplete()", () => {
  it("is true only for ACTIVE", () => {
    expect(isOnboardingComplete("ACTIVE")).toBe(true);
    expect(isOnboardingComplete("BIOMETRIC_ENROLLED")).toBe(false);
    expect(isOnboardingComplete("INVITED")).toBe(false);
  });
});

describe("advanceStep()", () => {
  it("advances a valid transition and updates timestamp", () => {
    const session = makeSession("INVITED");
    const result = advanceStep(session, "LANGUAGE_SET", LATER);
    expect(result).not.toBeNull();
    expect(result!.currentStep).toBe("LANGUAGE_SET");
    expect(result!.updatedAt).toBe(LATER);
    // Original is not mutated
    expect(session.currentStep).toBe("INVITED");
  });

  it("returns null for invalid transition", () => {
    const session = makeSession("INVITED");
    expect(advanceStep(session, "OTP_VERIFIED", LATER)).toBeNull();
    expect(advanceStep(session, "ACTIVE", LATER)).toBeNull();
  });

  it("walks through the full flow", () => {
    let session: OnboardingSession | null = makeSession("INVITED");
    const steps: (typeof ONBOARDING_STEPS)[number][] = [
      "LANGUAGE_SET",
      "OTP_VERIFIED",
      "STORE_ASSIGNED",
      "BIOMETRIC_ENROLLED",
      "ACTIVE",
    ];
    for (const step of steps) {
      session = advanceStep(session!, step, LATER);
      expect(session).not.toBeNull();
      expect(session!.currentStep).toBe(step);
    }
    expect(isOnboardingComplete(session!.currentStep)).toBe(true);
  });
});
