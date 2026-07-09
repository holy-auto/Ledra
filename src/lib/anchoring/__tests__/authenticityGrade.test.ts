import { describe, it, expect } from "vitest";
import { computeAuthenticityGrade, highestGrade, type GradeFlags } from "../authenticityGrade";

/** A fully capture-bound photo (attested device + fresh nonce + production C2PA seal). */
const bound = (over: Partial<GradeFlags> = {}): GradeFlags => ({
  hasSha256: true,
  hasC2pa: true,
  c2paKind: "production",
  hasTsa: false,
  deviceOk: true,
  nonceOk: true,
  deepfakeOk: null,
  ...over,
});

describe("computeAuthenticityGrade — capture-binding semantics", () => {
  it("unverified without a server hash", () => {
    expect(computeAuthenticityGrade(bound({ hasSha256: false }))).toBe("unverified");
  });

  it("guaranteed (verified) when device + nonce + production C2PA seal all hold", () => {
    expect(computeAuthenticityGrade(bound())).toBe("verified");
  });

  it("premium = guaranteed + deepfake likely_real (AI is additive, not a gate)", () => {
    expect(computeAuthenticityGrade(bound({ deepfakeOk: true }))).toBe("premium");
  });

  it("TSA token alone satisfies the capture-time seal (no C2PA needed)", () => {
    expect(computeAuthenticityGrade(bound({ hasC2pa: false, c2paKind: "none", hasTsa: true }))).toBe("verified");
  });

  // ── Each missing link of the chain drops to best-effort (basic) ──
  it("basic when device attestation is missing", () => {
    expect(computeAuthenticityGrade(bound({ deviceOk: false }))).toBe("basic");
  });

  it("basic when the capture nonce is missing/failed (e.g. offline or replay)", () => {
    expect(computeAuthenticityGrade(bound({ nonceOk: false }))).toBe("basic");
  });

  it("basic when there is no capture-time seal (no production C2PA and no TSA)", () => {
    expect(computeAuthenticityGrade(bound({ hasC2pa: false, c2paKind: "none", hasTsa: false }))).toBe("basic");
  });

  it("dev-signed C2PA does NOT count as a seal (no trust chain)", () => {
    expect(computeAuthenticityGrade(bound({ c2paKind: "dev-signed", hasTsa: false }))).toBe("basic");
  });

  it("deepfake never lifts an unbound photo above basic", () => {
    expect(computeAuthenticityGrade(bound({ deviceOk: false, deepfakeOk: true }))).toBe("basic");
  });

  it("legacy/web upload (hash only, no capture evidence) stays basic — monotonic, never spuriously upgraded", () => {
    expect(
      computeAuthenticityGrade({
        hasSha256: true,
        hasC2pa: false,
        hasTsa: false,
        deviceOk: false,
        nonceOk: false,
        deepfakeOk: null,
      }),
    ).toBe("basic");
  });
});

describe("highestGrade", () => {
  it("picks the strongest and never downgrades", () => {
    expect(highestGrade(["basic", "verified", null, "unverified"])).toBe("verified");
    expect(highestGrade(["premium", "basic"])).toBe("premium");
    expect(highestGrade([])).toBe("unverified");
  });
});
